#pragma once

// ─── Device Identity (SET THESE BEFORE FLASHING) ───────────────────────────
#define DEVICE_ID       "KIYANNA-001"
#define DEVICE_SECRET   "002274de858f3328f55d743448154407"

// ─── WiFi (SET THESE BEFORE FLASHING) ──────────────────────────────────────
#define WIFI_SSID       "DivinduSLT2.4G"
#define WIFI_PASSWORD   "99999999"

// ─── API Endpoints ──────────────────────────────────────────────────────────
#define API_BASE_URL    "https://git-online-dashboard-device.vercel.app"
#define AUTH_ENDPOINT   "/api/device/auth"
#define CHAT_ENDPOINT   "/api/device/chat"
#define HB_ENDPOINT     "/api/device/heartbeat"
#define CONV_ENDPOINT   "/api/device/conversation"

// ─── Pin Config ─────────────────────────────────────────────────────────────
// LCD ST7789
#define LCD_CS    10
#define LCD_DC     9
#define LCD_RST    8
#define LCD_MOSI  11
#define LCD_SCLK  12
#define LCD_BL    14

// I2S Microphone
#define I2S_MIC_WS    5
#define I2S_MIC_SCK   4
#define I2S_MIC_SD    6
#define I2S_MIC_PORT  I2S_NUM_0

// I2S Speaker
#define I2S_SPK_BCLK   15
#define I2S_SPK_LRCLK  16
#define I2S_SPK_DOUT   17
#define I2S_SPK_PORT   I2S_NUM_1

// LED Ring
#define LED_PIN    48
#define LED_COUNT  12

// Buttons
#define BOOT_BTN   0

// ─── Audio Config ───────────────────────────────────────────────────────────
#define SAMPLE_RATE      16000
#define RECORD_DURATION  5000   // ms max recording
#define SILENCE_TIMEOUT  1500   // ms of silence to stop recording

// ─── Timing ─────────────────────────────────────────────────────────────────
#define HEARTBEAT_INTERVAL  300000  // 5 minutes
#define AUTH_RETRY_DELAY     10000  // 10 seconds
#define TOKEN_REFRESH_BUFFER  3600  // refresh 1h before expiry

// ─── Wake Word ──────────────────────────────────────────────────────────────
#define USE_BUTTON_WAKE   true   // v1: button press to start listening
#define WAKE_WORD         "Hey Kiyanna"

// ─── Debug ──────────────────────────────────────────────────────────────────
#define SERIAL_BAUD  115200
#define DEBUG_MODE   true
