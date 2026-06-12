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

// ES8311 — shared full-duplex I2S bus:
// GPIO10 carries the codec ADC/microphone data back to the ESP32.
// MCLK must run before es8311_init() writes codec registers.
#define I2S_MCLK      16
#define I2S_BCLK       9
#define I2S_WS        45
#define I2S_DIN       10   // ES8311 ADC → ESP32 RX
#define I2S_DOUT       8   // ESP32 TX → ES8311 DIN → DAC → speaker

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
#define RECORD_DURATION       3000   // ms max recording
#define SILENCE_TIMEOUT        450   // stop quickly after the user finishes speaking
#define RECORD_SPEECH_LEVEL    500   // fallback AC energy required while recording
#define VAD_MIN_LEVEL         1000   // minimum AC energy for hands-free trigger
#define VAD_NOISE_MARGIN       300   // trigger this far above learned room noise
#define VAD_TRIGGER_MS         160   // sustained speech required to trigger
#define VAD_CALIBRATION_MS    3000   // learn ambient room level after becoming idle
#define CONV_COOLDOWN_MS      1400   // avoid hearing the tail of Kiyanna's own reply

// ─── Timing ─────────────────────────────────────────────────────────────────
#define HEARTBEAT_INTERVAL  300000  // 5 minutes
#define AUTH_RETRY_DELAY     10000  // 10 seconds
#define TOKEN_REFRESH_BUFFER  3600  // refresh 1h before expiry

// ─── Wake Word ──────────────────────────────────────────────────────────────
#define USE_BUTTON_WAKE   true   // button/touch remain available as fallback
#define USE_ALWAYS_LISTEN true   // adaptive VAD starts conversations hands-free
#define WAKE_WORD         "Hey Kiyanna"

// ─── Debug ──────────────────────────────────────────────────────────────────
#define SERIAL_BAUD  115200
#define DEBUG_MODE   true
