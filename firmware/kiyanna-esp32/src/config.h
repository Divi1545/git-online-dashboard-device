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

// ─── Pin Config — sp-esp32-s3-1.54-muma (Spotpear/MUMA compact box) ─────────
// LCD ST7789 240x240 via SPI3
#define LCD_CS    5
#define LCD_DC    47
#define LCD_RST   38
#define LCD_MOSI  2
#define LCD_SCLK  4
#define LCD_BL    42   // active-LOW (HIGH = off, LOW = on)

// ES8311 Audio Codec — I2C bus for register init
#define CODEC_I2C_SDA  15
#define CODEC_I2C_SCL  14
#define CODEC_ADDR     0x18   // ES8311 default I2C address
#define CODEC_PA_PIN   46     // Power amplifier enable (HIGH = on)

// ES8311 — shared I2S bus (full-duplex: DIN = mic ADC out, DOUT = spk DAC in)
#define I2S_MCLK      16
#define I2S_BCLK       9
#define I2S_WS        45
#define I2S_DIN       10   // mic data: codec ADC → ESP32
#define I2S_DOUT       8   // spk data: ESP32 → codec DAC
#define I2S_PORT      I2S_NUM_0

// Keep old aliases so existing code compiles unchanged
#define I2S_MIC_WS    I2S_WS
#define I2S_MIC_SCK   I2S_BCLK
#define I2S_MIC_SD    I2S_DIN
#define I2S_MIC_PORT  I2S_PORT
#define I2S_SPK_BCLK  I2S_BCLK
#define I2S_SPK_LRCLK I2S_WS
#define I2S_SPK_DOUT  I2S_DOUT
#define I2S_SPK_PORT  I2S_PORT

// LED Ring (WS2812B)
#define LED_PIN    48
#define LED_COUNT  12

// Button
#define BOOT_BTN   0   // GPIO0 — physical boot button, active LOW

// CST816 capacitive touch (on-screen, separate I2C from codec — Wire1/I2C_NUM_1)
#define TOUCH_I2C_SDA  11
#define TOUCH_I2C_SCL   7
#define TOUCH_RST       6
#define TOUCH_INT      12   // HIGH at boot = touch IC present
#define TOUCH_ADDR   0x15   // CST816 fixed I2C address

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
