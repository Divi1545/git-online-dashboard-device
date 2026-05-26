# Kiyanna AI Firmware — MUMA ESP32-S3

Firmware for the **AiDesk S1** hardware device by AI Code Agency Pvt Ltd.

## Hardware
- MUMA ESP32-S3 N16R8 box (from PiPiPi Store / Shenzhen Lonten Technology)
- 1.54" ST7789 LCD 240×240
- I2S MEMS microphone + MAX98357A speaker amp
- WS2812B NeoPixel LED ring (12 LEDs)
- ESP32-S3 dual-core 240MHz, 16MB Flash, 8MB PSRAM

## Setup

### 1. Install PlatformIO
```bash
pip install platformio
```
or use the PlatformIO VS Code extension.

### 2. Configure Device
Edit `config.h`:
```cpp
#define DEVICE_ID       "KIYANNA-001"       // your device ID
#define DEVICE_SECRET   "your_32_char_hex"  // from flasher or Supabase
#define WIFI_SSID       "YourWiFiSSID"
#define WIFI_PASSWORD   "YourWiFiPassword"
```

### 3. Flash
Hold **BOOT** button, plug in USB-C, then:
```bash
pio run --target upload
```

Or use the Kiyanna Flasher web tool (Chrome) for browser-based flashing.

### 4. Monitor
```bash
pio device monitor
```

## Boot Flow
```
Boot → WiFi → POST /api/device/auth
     → 200 OK (JWT) → LED green → idle
     → Button press → Record → Claude haiku → TTS → Speaker
     → 402 (lapsed) → LED red → "Subscription Expired" screen
```

## LED States
| State | Color | Pattern |
|-------|-------|---------|
| Idle | Blue | Slow breathing |
| Listening | Blue | Solid |
| Processing | Blue | Fast pulse |
| Speaking | Green | Soft glow |
| Alert | Amber | 3 flashes |
| Lapsed | Red | Solid |
| Error | Red | Rapid flash |
| Boot | Rainbow | Spin |

## Required Backend
The `/api/device/chat` endpoint on your Vercel deployment must:
1. Accept `{ device_id, audio_base64, language }` + Bearer token
2. Decode WAV audio → STT (use Whisper or similar)
3. Send text to Claude haiku-4-5 via Anthropic API
4. Return `{ text, audio_url?, language }`

See `app/api/device/` in the dashboard repo.

## Cloud-Lock
This device is cloud-locked. Without an active subscription in Supabase, the device returns 402 on boot and shows the "Subscription Expired" screen. It retries every 10 minutes.
