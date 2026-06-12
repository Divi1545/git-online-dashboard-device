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
// g_touchFired: set by ISR on FALLING edge of TOUCH_INT (GPIO12).
// The CST816 pulls INT LOW on every touch-down event.
// Cleared in loop immediately after handling so each tap fires once.
static volatile bool g_touchFired = false;
static void IRAM_ATTR touchISR() { g_touchFired = true; }

static void initTouch() {
  // Hardware reset CST816
  pinMode(TOUCH_RST, OUTPUT);
  digitalWrite(TOUCH_RST, LOW);  delay(10);
  digitalWrite(TOUCH_RST, HIGH); delay(300);  // chip needs 300ms after reset

  // Try to find the chip on Wire1 (SDA=11, SCL=7) via a 0-byte I2C probe.
  // This is optional — the INT pin fires on touch regardless of I2C success.
  Wire1.begin(TOUCH_I2C_SDA, TOUCH_I2C_SCL, 400000);
  Wire1.beginTransmission(TOUCH_ADDR);
  bool found = (Wire1.endTransmission() == 0);

  if (found) {
    // Disable auto-sleep so the chip stays awake between taps
    Wire1.beginTransmission(TOUCH_ADDR);
    Wire1.write(0xFE);  // motion register
    Wire1.write(0x01);  // continuous active mode
    Wire1.endTransmission();
    Serial.println("[TOUCH] CST816 found on Wire1 — auto-sleep disabled");
  } else {
    Serial.println("[TOUCH] CST816 not found via I2C — using INT-only mode");
    // INT-only mode still works: the chip pulses TOUCH_INT LOW on every tap
    // even without I2C config. We just won't be able to disable sleep.
  }

  // Always attach interrupt — TOUCH_INT fires on touch regardless of I2C
  pinMode(TOUCH_INT, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(TOUCH_INT), touchISR, FALLING);
  Serial.printf("[TOUCH] Ready — INT on GPIO%d FALLING (I2C %s)\n",
      TOUCH_INT, found ? "OK" : "not found");
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
String pendingConfirmation = "";
bool isLapsed = false;
unsigned long lastHeartbeat = 0;
unsigned long lastAuthTime = 0;
int sessionCount = 0;
unsigned long lastConvEnd = 0;  // cooldown: ignore touch/VAD for CONV_COOLDOWN_MS after each conversation
float vadNoiseFloor = 700.0f;
unsigned long vadSpeechStart = 0;
unsigned long vadCalibrateUntil = 0;

static int measureAcLevel(const int16_t* stereo, int frames) {
  if (!stereo || frames <= 1) return 0;

  int64_t leftMean = 0;
  int64_t rightMean = 0;
  for (int i = 0; i < frames; i++) {
    leftMean += stereo[i * 2];
    rightMean += stereo[i * 2 + 1];
  }
  leftMean /= frames;
  rightMean /= frames;

  int64_t leftEnergy = 0;
  int64_t rightEnergy = 0;
  for (int i = 0; i < frames; i++) {
    leftEnergy += abs((int32_t)stereo[i * 2] - (int32_t)leftMean);
    rightEnergy += abs((int32_t)stereo[i * 2 + 1] - (int32_t)rightMean);
  }
  return (int)(max(leftEnergy, rightEnergy) / frames);
}

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
    display.showError("WiFi failed\nSSID: " WIFI_SSID "\nCheck password");
    led.setState(LED_ERROR);
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
    vadCalibrateUntil = millis() + VAD_CALIBRATION_MS;
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

  Serial.println("[CONV] Recording...");
  unsigned long recStart = millis();
  int recordSpeechLevel = max(RECORD_SPEECH_LEVEL, (int)vadNoiseFloor + 150);
  String audioBase64 = audio.recordToBase64(RECORD_DURATION, recordSpeechLevel);

  // Mic heard nothing — tell user and return
  if (audioBase64.isEmpty()) {
    Serial.println("[CONV] Silence — skipping API call");
    display.showError("Didn't hear you\nSpeak clearly and\ntap again");
    led.setState(LED_ERROR);
    delay(2500);
    appState = STATE_IDLE;
    led.setState(LED_IDLE);
    display.showIdle(DEVICE_ID);
    lastConvEnd = millis();
    return;
  }

  appState = STATE_PROCESSING;
  led.setState(LED_PROCESSING);
  display.showProcessing();

  Serial.println("[CONV] Sending to Claude...");
  ChatResult result = cloud.chat(jwtToken, audioBase64, "auto", pendingConfirmation);

  // ── Subscription lapsed ──────────────────────────────────────────────────
  if (result.lapsed) {
    led.setState(LED_LAPSED);
    display.showLapsed();
    appState = STATE_LAPSED;
    return;
  }

  // ── Legacy 422: server couldn't transcribe ───────────────────────────────
  if (result.noSpeech) {
    Serial.println("[CONV] Server: no speech transcribed (422)");
    display.showError("Didn't hear you\nSpeak clearly and\ntap again");
    led.setState(LED_ERROR);
    delay(2500);
    appState = STATE_IDLE;
    led.setState(LED_IDLE);
    display.showIdle(DEVICE_ID);
    lastConvEnd = millis();
    return;
  }

  // ── Auth token expired — retry once ─────────────────────────────────────
  if (!result.success && result.error.indexOf("Token expired") >= 0) {
    Serial.println("[CONV] Token expired — re-authing...");
    doAuth();
    if (appState == STATE_IDLE) {
      result = cloud.chat(jwtToken, audioBase64, "auto", pendingConfirmation);
    }
  }

  // ── Other hard error ─────────────────────────────────────────────────────
  if (!result.success) {
    Serial.printf("[CONV] Error: %s\n", result.error.c_str());
    display.showError(result.error.c_str());
    led.setState(LED_ERROR);
    delay(3000);
    appState = STATE_IDLE;
    led.setState(LED_IDLE);
    display.showIdle(DEVICE_ID);
    return;
  }

  // The token is an opaque, short-lived confirmation handle. It lets the next
  // voice turn say confirm/cancel without storing Island Loaf credentials here.
  pendingConfirmation = result.pendingConfirmation;

  // ── Got a text response — show it and speak it ───────────────────────────
  appState = STATE_SPEAKING;
  led.setState(LED_SPEAKING);
  display.showSpeaking(result.text.c_str());
  Serial.printf("[CONV] Reply: %.80s\n", result.text.c_str());

  // Determine TTS URL:
  //   - Server normally returns audio_url for Claude responses
  //   - For text-only responses ("I didn't catch that"), build the URL ourselves
  String ttsUrl = result.audioUrl;
  if (ttsUrl.isEmpty() && !result.text.isEmpty()) {
    ttsUrl = cloud.ttsUrlForText(result.text);
    Serial.println("[CONV] No audio_url from server — building TTS URL");
  }

  if (!ttsUrl.isEmpty()) {
    Serial.println("[CONV] Downloading TTS audio...");
    // 16 kHz mono PCM uses 32 KB/s. Allow roughly 24 seconds so normal
    // responses are not cut off by the old 8-second/256 KB limit.
    size_t audioBufSize = 768 * 1024;
    uint8_t* audioBuf = (uint8_t*)ps_malloc(audioBufSize);
    if (!audioBuf) audioBuf = (uint8_t*)malloc(audioBufSize);

    if (audioBuf) {
      size_t audioSize = cloud.downloadAudio(ttsUrl, audioBuf, audioBufSize, jwtToken);
      if (audioSize > 0) {
        Serial.printf("[CONV] Playing %u bytes via ES8311 DAC\n", (unsigned)audioSize);
        audio.playPCM(audioBuf, audioSize);
        Serial.println("[CONV] Playback done");
      } else {
        Serial.println("[CONV] TTS download empty — playing test tone to confirm speaker hardware");
        // Two-tone chime confirms the speaker is physically working even without TTS
        audio.playTone(880, 200, 1000);  // A5 — quiet chime
        delay(80);
        audio.playTone(660, 300, 1000);  // E5
      }
      free(audioBuf);
    } else {
      Serial.println("[CONV] PSRAM alloc failed for audio buffer");
      delay(3000);
    }
  }

  // Return to listening immediately after playback. Conversation logging is
  // intentionally omitted here because its extra HTTP request delays follow-up.
  sessionCount++;
  delay(100);
  appState = STATE_IDLE;
  led.setState(LED_IDLE);
  display.showIdle(DEVICE_ID);
  lastConvEnd = millis();
  vadSpeechStart = 0;
  vadCalibrateUntil = millis() + VAD_CALIBRATION_MS;
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

  // I2S full-duplex: both TX (speaker) and RX (mic) on I2S_NUM_0.
  // beginMic() enables both channels so MCLK starts immediately on GPIO16.
  Serial.println("[INIT] I2S...");
  audio.beginMic();
  Serial.println("[INIT] I2S OK");

  // Give ES8311 PLL 50ms to lock onto MCLK before writing registers.
  delay(50);

  Serial.println("[INIT] ES8311 codec...");
  bool codecOk = es8311_init(SAMPLE_RATE);
  if (!codecOk) {
    Serial.println("[INIT] CODEC FAILED — ES8311 not found on I2C!");
    char codecErr[64];
    snprintf(codecErr, sizeof(codecErr), "ES8311 not found!\nSDA=%d SCL=%d\nCheck I2C wiring",
             CODEC_I2C_SDA, CODEC_I2C_SCL);
    display.showError(codecErr);
    led.setState(LED_ERROR);
    // Halt — no mic or speaker without codec
    while (true) { led.update(); delay(100); }
  }
  Serial.println("[INIT] Codec OK");

  // Small delay to let the ES8311 ADC/DAC stabilize after codec config.
  delay(200);

  // PA enabled after codec DAC is stable — avoids startup pop.
  Serial.println("[INIT] Speaker PA...");
  audio.beginSpeaker();
  Serial.println("[INIT] Speaker OK");

  // Boot tone — short beep confirms codec DAC + speaker are wired correctly.
  // You must hear this on every boot. If silent, check CODEC_PA_PIN or speaker.
  audio.playTone(880, 120, 1500);   // A5 — short beep
  delay(60);
  audio.playTone(1175, 120, 1500);  // D6 — rising confirmation

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
          g_touchFired = false;  // discard any ISR that fired during the conversation
          lastConvEnd = millis();
          break;
        }
      }

      // ── CST816 touch trigger ─────────────────────────────────────────────
      // g_touchFired is set by the ISR on FALLING edge (touch-down).
      // CST816 only fires INT on touch-down, not release — so we fire
      // immediately, same as the button. No state machine needed.
      if (g_touchFired) {
        g_touchFired = false;
        if (millis() - lastConvEnd >= CONV_COOLDOWN_MS) {
          Serial.println("[TOUCH] Tapped — starting conversation");
          handleConversation();
          g_touchFired = false;  // discard any ISR that fired during the conversation
          lastConvEnd = millis();
          break;
        }
      }

      // ── Always-listening adaptive voice activity detection ───────────────
      // Learn the room's noise floor and trigger only on sustained speech.
      {
        static DRAM_ATTR int16_t vadBuf[256];
        static unsigned long lastLevelLog = 0;
        size_t vadRead = audio.readRaw(vadBuf, sizeof(vadBuf));
        if (vadRead > 0) {
          int frames = vadRead / 4;
          int level = measureAcLevel(vadBuf, frames);
          int threshold = max(VAD_MIN_LEVEL, (int)vadNoiseFloor + VAD_NOISE_MARGIN);
          display.updateMicLevel(min(32767, level * 12), threshold * 12);

          bool cooldownDone = millis() - lastConvEnd >= CONV_COOLDOWN_MS;
          bool calibrated = millis() >= vadCalibrateUntil;
          if (!calibrated) {
            vadSpeechStart = 0;
            vadNoiseFloor = vadNoiseFloor * 0.90f + level * 0.10f;
          } else if (USE_ALWAYS_LISTEN && cooldownDone && level > threshold) {
            if (vadSpeechStart == 0) vadSpeechStart = millis();
            if (millis() - vadSpeechStart >= VAD_TRIGGER_MS) {
              Serial.printf("[VAD] Speech detected level=%d threshold=%d — starting conversation\n",
                            level, threshold);
              vadSpeechStart = 0;
              handleConversation();
              g_touchFired = false;
              lastConvEnd = millis();
              break;
            }
          } else {
            vadSpeechStart = 0;
            if (calibrated && cooldownDone && level < threshold) {
              vadNoiseFloor = vadNoiseFloor * 0.98f + level * 0.02f;
            }
          }

          if (millis() - lastLevelLog > 5000) {
            Serial.printf("[MIC] level=%d noise=%d trigger=%d (always listening)\n",
                          level, (int)vadNoiseFloor, threshold);
            lastLevelLog = millis();
          }
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
