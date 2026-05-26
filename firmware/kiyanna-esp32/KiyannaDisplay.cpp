#include "KiyannaDisplay.h"

// Teal: #0D9488 → RGB565
#define TEAL   0x0949  // approximate RGB565
#define AMBER  0xFD20  // #F59E0B approximate
#define RED_K  0xF800  // #EF4444

KiyannaDisplay::KiyannaDisplay()
  : _state(DISP_BOOT), _lastUpdate(0), _animStep(0) {}

void KiyannaDisplay::begin() {
  _tft.init();
  _tft.setRotation(0);
  _tft.fillScreen(TFT_BLACK);
  pinMode(LCD_BL, OUTPUT);
  digitalWrite(LCD_BL, HIGH);
}

void KiyannaDisplay::showBoot() {
  _state = DISP_BOOT;
  clear();
  _tft.setTextColor(TEAL);
  _tft.setTextSize(3);
  _tft.setCursor(40, 90);
  _tft.print("Kiyanna");
  _tft.setTextColor(TFT_WHITE);
  _tft.setTextSize(1);
  _tft.setCursor(55, 130);
  _tft.print("AI Hardware v1.0");
  _tft.setCursor(50, 160);
  _tft.setTextColor(0x7BEF); // gray
  _tft.print("aicodeagency.org");
}

void KiyannaDisplay::showConnecting(const char* ssid) {
  _state = DISP_CONNECTING;
  clear();
  _tft.setTextColor(TEAL);
  _tft.setTextSize(2);
  _tft.setCursor(30, 80);
  _tft.print("Kiyanna AI");
  _tft.setTextColor(TFT_WHITE);
  _tft.setTextSize(1);
  _tft.setCursor(20, 120);
  _tft.print("Connecting to WiFi...");
  _tft.setCursor(20, 140);
  _tft.setTextColor(0x7BEF);
  _tft.print(ssid);
}

void KiyannaDisplay::showIdle(const char* deviceId) {
  _state = DISP_IDLE;
  _deviceId = String(deviceId);
  clear();
  // Teal header bar
  _tft.fillRect(0, 0, 240, 40, TEAL);
  _tft.setTextColor(TFT_WHITE);
  _tft.setTextSize(2);
  _tft.setCursor(55, 10);
  _tft.print("Kiyanna AI");

  // Center icon area
  _tft.setTextColor(0x7BEF);
  _tft.setTextSize(1);
  _tft.setCursor(50, 100);
  _tft.print("Press button to speak");
  _tft.setCursor(65, 120);
  _tft.print("or say wake word");

  // Status dot
  _tft.fillCircle(120, 160, 8, TEAL);

  // Device ID footer
  _tft.setTextColor(0x4A49);
  _tft.setTextSize(1);
  _tft.setCursor(10, 225);
  _tft.print(deviceId);
}

void KiyannaDisplay::showListening() {
  _state = DISP_LISTENING;
  _animStep = 0;
  clear();
  _tft.fillRect(0, 0, 240, 40, TEAL);
  _tft.setTextColor(TFT_WHITE);
  _tft.setTextSize(2);
  _tft.setCursor(55, 10);
  _tft.print("Kiyanna AI");

  _tft.setTextColor(TFT_WHITE);
  _tft.setTextSize(2);
  _tft.setCursor(55, 100);
  _tft.print("Listening");

  // Mic icon (simple circle)
  _tft.drawCircle(120, 160, 20, TFT_WHITE);
  _tft.fillCircle(120, 160, 8, TFT_WHITE);
}

void KiyannaDisplay::showProcessing() {
  _state = DISP_PROCESSING;
  _animStep = 0;
  clear();
  _tft.fillRect(0, 0, 240, 40, TEAL);
  _tft.setTextColor(TFT_WHITE);
  _tft.setTextSize(2);
  _tft.setCursor(55, 10);
  _tft.print("Kiyanna AI");

  _tft.setTextColor(0x7BEF);
  _tft.setTextSize(1);
  _tft.setCursor(80, 110);
  _tft.print("Thinking...");
}

void KiyannaDisplay::showSpeaking(const char* text) {
  _state = DISP_SPEAKING;
  _speakText = String(text);
  clear();
  _tft.fillRect(0, 0, 240, 40, TEAL);
  _tft.setTextColor(TFT_WHITE);
  _tft.setTextSize(2);
  _tft.setCursor(55, 10);
  _tft.print("Kiyanna AI");

  // Response text
  _tft.setTextColor(TFT_WHITE);
  _tft.setTextSize(1);
  _tft.setCursor(10, 60);
  _tft.setTextWrap(true);
  // truncate to fit
  String display = _speakText;
  if (display.length() > 160) display = display.substring(0, 157) + "...";
  _tft.print(display);

  // Speaking indicator bar
  _tft.fillRect(0, 220, 240, 20, TEAL);
  _tft.setTextColor(TFT_BLACK);
  _tft.setCursor(85, 225);
  _tft.print("Speaking...");
}

void KiyannaDisplay::showLapsed() {
  _state = DISP_LAPSED;
  _tft.fillScreen(RED_K);
  _tft.setTextColor(TFT_WHITE);
  _tft.setTextSize(2);
  _tft.setCursor(20, 70);
  _tft.print("Subscription");
  _tft.setCursor(45, 95);
  _tft.print("Expired");
  _tft.setTextSize(1);
  _tft.setCursor(15, 140);
  _tft.print("Please renew your plan at");
  _tft.setCursor(25, 158);
  _tft.setTextColor(AMBER);
  _tft.print("aicodeagency.org");
  _tft.setTextColor(0x7BEF);
  _tft.setCursor(55, 195);
  _tft.setTextSize(1);
  _tft.print(DEVICE_ID);
}

void KiyannaDisplay::showError(const char* msg) {
  _state = DISP_ERROR;
  clear();
  _tft.fillRect(0, 0, 240, 40, RED_K);
  _tft.setTextColor(TFT_WHITE);
  _tft.setTextSize(2);
  _tft.setCursor(40, 10);
  _tft.print("Error");
  _tft.setTextSize(1);
  _tft.setTextColor(0xC618);
  _tft.setCursor(10, 70);
  _tft.setTextWrap(true);
  _tft.print(msg);
  _tft.setTextColor(0x7BEF);
  _tft.setCursor(40, 160);
  _tft.print("Retrying in 10s...");
}

void KiyannaDisplay::update() {
  // Animate processing dots
  if (_state == DISP_PROCESSING) {
    unsigned long now = millis();
    if (now - _lastUpdate > 400) {
      _animStep = (_animStep + 1) % 4;
      _tft.fillRect(80, 130, 80, 20, TFT_BLACK);
      _tft.setTextColor(TEAL);
      _tft.setTextSize(2);
      _tft.setCursor(80, 130);
      String dots = "";
      for (int i = 0; i < _animStep; i++) dots += ".";
      _tft.print(dots);
      _lastUpdate = now;
    }
  }
}

void KiyannaDisplay::clear(uint16_t color) {
  _tft.fillScreen(color);
}

uint16_t KiyannaDisplay::rgb(uint8_t r, uint8_t g, uint8_t b) {
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}
