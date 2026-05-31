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
#include <esp_system.h>
#include "config.h"
#include "KiyannaLED.h"
#include "KiyannaDisplay.h"
#include "KiyannaAuth.h"
#include "KiyannaAudio.h"
#include "KiyannaCloud.h"

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

  Serial.println("[INIT] Mic...");
  audio.beginMic();
  Serial.println("[INIT] Mic OK");

  Serial.println("[INIT] Speaker...");
  audio.beginSpeaker();
  Serial.println("[INIT] Speaker OK");

  // Boot button
  pinMode(BOOT_BTN, INPUT_PULLUP);

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
      // Check for wake trigger (button press in v1)
      if (digitalRead(BOOT_BTN) == LOW) {
        delay(50);  // debounce
        if (digitalRead(BOOT_BTN) == LOW) {
          Serial.println("[WAKE] Button pressed!");
          handleConversation();
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
