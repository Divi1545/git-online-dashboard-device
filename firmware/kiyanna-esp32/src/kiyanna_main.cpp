/**
 * Kiyanna AI Firmware v1.0
 * MUMA ESP32-S3 N16R8 Box
 *
 * AI Code Agency Pvt Ltd — aicodeagency.org
 *
 * Hardware: ESP32-S3, ST7789 LCD 240x240, I2S Mic, MAX98357A Speaker, WS2812B LED Ring
 *
 * Boot flow:
 *   1. WiFi connect
 *   2. POST /api/device/auth → JWT token
 *   3. Listen for wake word / button press
 *   4. Record audio → POST /api/device/chat → Claude haiku response
 *   5. Play TTS audio via I2S speaker
 *   6. Log conversation to dashboard
 *   7. Heartbeat every 5 minutes
 */

#include <Arduino.h>
#include <WiFi.h>
#include <Wire.h>
#include <esp_system.h>
#include "config.h"
#include "KiyannaLED.h"
#include "KiyannaDisplay.h"
#include "KiyannaAuth.h"
#include "KiyannaAudio.h"
#include "KiyannaCloud.h"
#include "KiyannaCodec.h"

// ─── CST816 Touch ────────────────────────────────────────────────────────────
static bool touchAvailable = false;
static TwoWire* g_touchBus = nullptr;

// Interrupt-based detection: INT pin fires FALLING when chip has touch data.
// This ensures we only read the I2C bus while the chip is active (awake).
static volatile bool g_touchFired = false;
static void IRAM_ATTR touchISR() { g_touchFired = true; }

// Returns number of fingers currently touching screen
static int cst816_fingers() {
  if (!g_touchBus || !g_touchFired) return 0;
  g_touchFired = false;
  // Direct requestFrom without register write — CST816 sequential read starts
  // at register 0x00 (gesture) → 0x01 (finger count)
  if (g_touchBus->requestFrom((uint8_t)TOUCH_ADDR, (uint8_t)2) >= 2) {
    g_touchBus->read();  // byte 0: gesture ID
    return g_touchBus->read() & 0x0F;  // byte 1: finger count
  }
  return 0;
}

static void initTouch() {
  // Hardware reset — hold RST LOW then release
  // CST816 I2C is not stable until ~300ms after RST goes HIGH
  pinMode(TOUCH_RST, OUTPUT);
  digitalWrite(TOUCH_RST, LOW);  delay(10);
  digitalWrite(TOUCH_RST, HIGH); delay(300);
  pinMode(TOUCH_INT, INPUT_PULLUP);

  // Scan Wire1 (SDA=11, SCL=7) for any I2C device
  Wire1.begin(TOUCH_I2C_SDA, TOUCH_I2C_SCL, 400000);
  Serial.println("[TOUCH] Scanning Wire1 (SDA=11, SCL=7)...");
  int wire1Count = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire1.beginTransmission(addr);
    if (Wire1.endTransmission() == 0) {
      Serial.printf("[TOUCH] Wire1: device at 0x%02X\n", addr);
      wire1Count++;
    }
  }
  if (wire1Count == 0) Serial.println("[TOUCH] Wire1: nothing found");

  // Also scan Wire (SDA=15, SCL=14 — same bus as ES8311 codec)
  Serial.println("[TOUCH] Scanning Wire (SDA=15, SCL=14)...");
  int wireCount = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("[TOUCH] Wire: device at 0x%02X\n", addr);
      wireCount++;
    }
  }
  if (wireCount == 0) Serial.println("[TOUCH] Wire: nothing found");

  // Helper: read chip ID register 0xA3 from a given I2C bus.
  // CST816 requires a full STOP between write and read (repeated start = Error -1).
  struct TouchProbe {
    static uint8_t read(TwoWire* bus) {
      bus->beginTransmission(TOUCH_ADDR);
      bus->write(0xA3);
      bus->endTransmission(true);  // STOP condition required by CST816
      delay(2);
      bus->requestFrom((uint8_t)TOUCH_ADDR, (uint8_t)1);
      return bus->available() ? bus->read() : 0x00;
    }
  };

  // Use scan result to detect which bus has the touch chip (ID register read fails
  // with Error -1 on CST816 — it rejects repeated-start and timed write+read).
  // The scan (0-byte write) is all we need to confirm presence.
  if (wire1Count > 0) {
    g_touchBus = &Wire1;
    Serial.println("[TOUCH] CST816 confirmed on Wire1 (SDA=11,SCL=7)");
  } else if (wireCount > 0 && wire1Count == 0) {
    // Unlikely but check Wire too (touch and codec at different addresses)
    Wire.beginTransmission(TOUCH_ADDR);
    if (Wire.endTransmission() == 0) {
      g_touchBus = &Wire;
      Serial.println("[TOUCH] CST816 confirmed on Wire (SDA=15,SCL=14)");
    }
  }

  touchAvailable = (g_touchBus != nullptr);
  if (touchAvailable) {
    // Disable auto-sleep: write-only (no read-back needed)
    g_touchBus->beginTransmission(TOUCH_ADDR);
    g_touchBus->write(0xFE);
    g_touchBus->write(0x01);
    g_touchBus->endTransmission();
    // Attach falling-edge interrupt — fires when chip has touch data ready
    pinMode(TOUCH_INT, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(TOUCH_INT), touchISR, FALLING);
    Serial.println("[TOUCH] Touch ready — interrupt attached (GPIO12 FALLING)");
  } else {
    Serial.println("[TOUCH] CST816 not found on either bus");
  }
}

// ─── Global Objects ──────────────────────────────────────────────────────────
KiyannaLED    led;
KiyannaDisplay display;
KiyannaAuth   auth;
KiyannaAudio  audio;
KiyannaCloud  cloud;

// ─── State ───────────────────────────────────────────────────────────────────
enum AppState {
  STATE_BOOT,
  STATE_WIFI_CONNECT,
  STATE_AUTH,
  STATE_IDLE,
  STATE_LISTENING,
  STATE_PROCESSING,
  STATE_SPEAKING,
  STATE_LAPSED,
  STATE_ERROR
};

AppState appState = STATE_BOOT;
String jwtToken = "";
bool isLapsed = false;
unsigned long lastHeartbeat = 0;
unsigned long lastAuthTime = 0;
int sessionCount = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────
void connectWiFi() {
  Serial.print("[WIFI] Connecting to ");
  Serial.println(WIFI_SSID);
  display.showConnecting(WIFI_SSID);
  led.setState(LED_BOOT);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    led.update();
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("[WIFI] Connected! IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WIFI] Failed to connect!");
    appState = STATE_ERROR;
  }
}

void doAuth() {
  Serial.println("[AUTH] Authenticating device...");
  display.showProcessing();
  led.setState(LED_PROCESSING);

  AuthResult result = auth.authenticate();
  lastAuthTime = millis();

  if (result.success) {
    jwtToken = result.token;
    Serial.println("[AUTH] Success! Token received.");
    led.setState(LED_CONNECTED);
    display.showIdle(DEVICE_ID);
    appState = STATE_IDLE;
  } else if (result.lapsed) {
    Serial.println("[AUTH] Subscription lapsed!");
    led.setState(LED_LAPSED);
    display.showLapsed();
    appState = STATE_LAPSED;
  } else {
    Serial.print("[AUTH] Error: ");
    Serial.println(result.error);
    display.showError(result.error.c_str());
    led.setState(LED_ERROR);
    appState = STATE_ERROR;
  }
}

bool shouldReAuth() {
  // Re-auth if token is 23h old (1h buffer before 24h expiry)
  return millis() - lastAuthTime > (23UL * 60 * 60 * 1000);
}

void handleConversation() {
  appState = STATE_LISTENING;
  led.setState(LED_LISTENING);
  display.showListening();

  Serial.println("[CONV] Recording audio...");
  unsigned long recStart = millis();
  String audioBase64 = audio.recordToBase64(RECORD_DURATION);

  if (audioBase64.isEmpty()) {
    Serial.println("[CONV] No audio captured");
    appState = STATE_IDLE;
    led.setState(LED_IDLE);
    display.showIdle(DEVICE_ID);
    return;
  }

  appState = STATE_PROCESSING;
  led.setState(LED_PROCESSING);
  display.showProcessing();

  Serial.println("[CONV] Sending to Claude...");
  ChatResult result = cloud.chat(jwtToken, audioBase64);

  if (result.lapsed) {
    // Subscription lapsed during conversation
    led.setState(LED_LAPSED);
    display.showLapsed();
    appState = STATE_LAPSED;
    return;
  }

  if (!result.success) {
    if (result.error.indexOf("Token expired") >= 0) {
      // Re-auth and retry once
      Serial.println("[CONV] Token expired, re-authing...");
      doAuth();
      if (appState == STATE_IDLE) {
        result = cloud.chat(jwtToken, audioBase64);
      }
    }
    if (!result.success) {
      Serial.print("[CONV] Error: ");
      Serial.println(result.error);
      display.showError(result.error.c_str());
      led.setState(LED_ERROR);
      delay(3000);
      appState = STATE_IDLE;
      led.setState(LED_IDLE);
      display.showIdle(DEVICE_ID);
      return;
    }
  }

  // Got response — speak it
  appState = STATE_SPEAKING;
  led.setState(LED_SPEAKING);
  display.showSpeaking(result.text.c_str());

  Serial.print("[CONV] Response: ");
  Serial.println(result.text.substring(0, 80) + "...");

  // Play audio response if URL provided
  if (!result.audioUrl.isEmpty()) {
    Serial.println("[CONV] Streaming TTS audio...");
    // Download and play via I2S
    size_t audioBufSize = 256 * 1024;  // 256KB buffer
    uint8_t* audioBuf = (uint8_t*)ps_malloc(audioBufSize);
    if (audioBuf) {
      size_t audioSize = cloud.downloadAudio(result.audioUrl, audioBuf, audioBufSize, jwtToken);
      if (audioSize > 0) {
        audio.playPCM(audioBuf, audioSize);
      }
      free(audioBuf);
    }
  } else {
    // No audio URL — display text only, beep or wait
    Serial.println("[CONV] No audio URL — text only response");
    delay(3000 + result.text.length() * 50);  // rough reading time
  }

  // Log the conversation
  int duration = (millis() - recStart) / 1000;
  sessionCount++;
  String sessionId = String(DEVICE_ID) + "-" + String(millis());
  ConvLog log = {
    sessionId,
    result.language.isEmpty() ? "en" : result.language,
    duration,
    1  // 1 exchange per session in v1
  };
  cloud.logConversation(jwtToken, log);

  // Return to idle
  delay(500);
  appState = STATE_IDLE;
  led.setState(LED_IDLE);
  display.showIdle(DEVICE_ID);
}

// ─── Setup ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(500);
  Serial.println("\n╔══════════════════════════════════╗");
  Serial.println("║   Kiyanna AI — MUMA ESP32-S3     ║");
  Serial.println("║   AI Code Agency Pvt Ltd         ║");
  Serial.println("║   aicodeagency.org               ║");
  Serial.println("╚══════════════════════════════════╝");
  Serial.print("Device: ");
  Serial.println(DEVICE_ID);

  // Init peripherals — debug prints to identify crash source
  Serial.println("[INIT] LED...");
  led.begin();
  led.setState(LED_BOOT);
  Serial.println("[INIT] LED OK");

  Serial.println("[INIT] Display...");
  display.begin();
  display.showBoot();
  Serial.println("[INIT] Display OK");

  // I2S must start first — it generates MCLK that the ES8311 PLL locks to.
  Serial.println("[INIT] I2S / Mic...");
  audio.beginMic();
  Serial.println("[INIT] I2S OK");


  // Codec init after MCLK is running so PLL can lock.
  // Dummy readRaw ensures I2S DMA is started and BCLK/MCLK are stable
  // before writing codec registers (i2s_driver_install may not start clocks
  // until the first data transfer on some ESP-IDF versions).
  {
    uint8_t dummy[256];
    audio.readRaw(dummy, sizeof(dummy));
    delay(20);
  }
  Serial.println("[INIT] ES8311 codec...");
  es8311_init(SAMPLE_RATE);
  Serial.println("[INIT] Codec OK");

  // PA enabled last — after codec DAC is stable — to avoid startup pop.
  Serial.println("[INIT] Speaker PA...");
  audio.beginSpeaker();
  Serial.println("[INIT] Speaker OK");

  // Boot button
  pinMode(BOOT_BTN, INPUT_PULLUP);

  // CST816 capacitive touch (on LCD panel)
  Serial.println("[INIT] CST816 touch...");
  initTouch();
  Serial.println("[INIT] Touch OK");

  delay(1500);  // show boot screen

  // WiFi
  appState = STATE_WIFI_CONNECT;
  connectWiFi();

  if (appState != STATE_ERROR) {
    appState = STATE_AUTH;
    doAuth();
  }
}

// ─── Loop ────────────────────────────────────────────────────────────────────
void loop() {
  led.update();
  display.update();

  switch (appState) {
    case STATE_IDLE: {
      // ── Button trigger ───────────────────────────────────────────────────
      if (digitalRead(BOOT_BTN) == LOW) {
        delay(25);
        if (digitalRead(BOOT_BTN) == LOW) {
          while (digitalRead(BOOT_BTN) == LOW) delay(10);
          Serial.println("[BTN] Button pressed — starting conversation");
          handleConversation();
          break;
        }
      }

      // ── CST816 touch trigger (short tap < 500ms on screen) ──────────────
      if (touchAvailable) {
        static bool wasTouched = false;
        static unsigned long touchStart = 0;
        int fingers = cst816_fingers();
        if (fingers > 0 && !wasTouched) {
          wasTouched = true;
          touchStart = millis();
        } else if (fingers == 0 && wasTouched) {
          wasTouched = false;
          if (millis() - touchStart < 500) {
            Serial.println("[TOUCH] Screen tapped — starting conversation");
            handleConversation();
            break;
          }
        }
      }

      // ── Always-on VAD — stereo from ES8311, L-channel is mic ──────────
      // DRAM_ATTR required: I2S DMA cannot write to PSRAM
      static DRAM_ATTR int16_t vadBuf[256];  // 128 stereo frames = 512 bytes
      static int speechChunks = 0;
      static unsigned long lastLevelLog = 0;
      size_t vadRead = audio.readRaw(vadBuf, sizeof(vadBuf));
      if (vadRead > 0) {
        int frames = vadRead / 4;  // stereo: 4 bytes per frame
        int32_t peak = 0;
        for (int i = 0; i < frames; i++) {
          int32_t v = abs((int32_t)vadBuf[i * 2]);  // L channel (even index)
          if (v > peak) peak = v;
        }
        // Mic level bar on display — green when above trigger threshold
        display.updateMicLevel(peak);

        if (millis() - lastLevelLog > 3000) {
          Serial.printf("[VAD] peak=%d\n", (int)peak);
          lastLevelLog = millis();
        }
        if (peak > 80) {
          speechChunks++;
          if (speechChunks >= 2) {
            speechChunks = 0;
            Serial.println("[WAKE] Voice detected!");
            handleConversation();
          }
        } else {
          if (speechChunks > 0) speechChunks--;
        }
      }

      // Heartbeat
      if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL) {
        Serial.println("[HB] Sending heartbeat...");
        bool ok = auth.heartbeat(jwtToken);
        if (!ok && auth.isLapsed()) {
          led.setState(LED_LAPSED);
          display.showLapsed();
          appState = STATE_LAPSED;
        }
        lastHeartbeat = millis();
      }

      // Token refresh check
      if (shouldReAuth()) {
        Serial.println("[AUTH] Token aging — re-authenticating...");
        doAuth();
      }
      break;
    }

    case STATE_LAPSED: {
      // Pulse red LED, show lapsed screen
      // Retry auth every 10 minutes in case operator renews
      static unsigned long lastLapsedRetry = 0;
      if (millis() - lastLapsedRetry > 600000UL) {
        Serial.println("[AUTH] Retrying auth (subscription may have been renewed)...");
        doAuth();
        lastLapsedRetry = millis();
      }
      break;
    }

    case STATE_ERROR: {
      // Retry after delay
      static unsigned long lastRetry = 0;
      if (millis() - lastRetry > AUTH_RETRY_DELAY) {
        Serial.println("[RETRY] Retrying connection...");
        if (WiFi.status() != WL_CONNECTED) {
          connectWiFi();
        }
        if (WiFi.status() == WL_CONNECTED) {
          doAuth();
        }
        lastRetry = millis();
      }
      break;
    }

    default:
      break;
  }

  delay(10);
}
