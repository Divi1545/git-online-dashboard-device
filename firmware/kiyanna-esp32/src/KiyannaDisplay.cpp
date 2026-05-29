#include "KiyannaDisplay.h"

KiyannaDisplay::KiyannaDisplay()
  : _tft(Adafruit_ST7789(LCD_CS, LCD_DC, LCD_MOSI, LCD_SCLK, LCD_RST)),
    _state(DISP_BOOT), _lastUpdate(0), _animStep(0) {}

void KiyannaDisplay::begin() {
  // Backlight on
  if (LCD_BL >= 0) {
    pinMode(LCD_BL, OUTPUT);
    digitalWrite(LCD_BL, HIGH);
  }
  // Adafruit ST7789 — no separate SPI.begin() needed
  _tft.init(240, 240, SPI_MODE2);
  _tft.setRotation(2);
  _tft.fillScreen(COLOR_BG);
  Serial.println("[DISP] ST7789 ready");
}

void KiyannaDisplay::showBoot() {
  _state = DISP_BOOT;
  clear();
  _tft.setTextColor(COLOR_TEAL);
  _tft.setTextSize(3);
  _tft.setCursor(35, 85);
  _tft.print("Kiyanna");
  _tft.setTextSize(1);
  _tft.setTextColor(COLOR_WHITE);
  _tft.setCursor(50, 130);
  _tft.print("AI Hardware v1.0");
  _tft.setTextColor(COLOR_GRAY);
  _tft.setCursor(45, 155);
  _tft.print("aicodeagency.org");
}

void KiyannaDisplay::showConnecting(const char* ssid) {
  _state = DISP_CONNECTING;
  clear();
  header();
  _tft.setTextColor(COLOR_WHITE);
  _tft.setTextSize(1);
  _tft.setCursor(20, 100);
  _tft.print("Connecting to WiFi...");
  _tft.setTextColor(COLOR_GRAY);
  _tft.setCursor(20, 118);
  _tft.print(ssid);
}

void KiyannaDisplay::showIdle(const char* deviceId) {
  _state = DISP_IDLE;
  clear();
  header();
  _tft.setTextColor(COLOR_GRAY);
  _tft.setTextSize(1);
  _tft.setCursor(45, 105);
  _tft.print("Press to speak");
  // Status dot
  _tft.fillCircle(120, 155, 10, COLOR_TEAL);
  // Device ID footer
  _tft.setTextColor(COLOR_DGRAY);
  _tft.setCursor(10, 225);
  _tft.print(deviceId);
}

void KiyannaDisplay::showListening() {
  _state = DISP_LISTENING;
  clear();
  header("Listening...", COLOR_TEAL);
  // Mic ring
  _tft.drawCircle(120, 155, 25, COLOR_WHITE);
  _tft.fillCircle(120, 155, 10, COLOR_WHITE);
}

void KiyannaDisplay::showProcessing() {
  _state = DISP_PROCESSING;
  _animStep = 0;
  clear();
  header("Thinking", COLOR_TEAL);
  _tft.setTextColor(COLOR_GRAY);
  _tft.setTextSize(1);
  _tft.setCursor(80, 118);
  _tft.print("Please wait");
}

void KiyannaDisplay::showSpeaking(const char* text) {
  _state = DISP_SPEAKING;
  clear();
  header("Kiyanna AI", COLOR_GREEN);
  // Response text — word wrap
  _tft.setTextColor(COLOR_WHITE);
  _tft.setTextSize(1);
  _tft.setTextWrap(true);
  _tft.setCursor(8, 55);
  String t = String(text);
  if (t.length() > 200) t = t.substring(0, 197) + "...";
  _tft.print(t);
  // Speaking bar
  _tft.fillRect(0, 220, 240, 20, COLOR_TEAL);
  _tft.setTextColor(COLOR_BG);
  _tft.setCursor(80, 225);
  _tft.print("Speaking...");
}

void KiyannaDisplay::showLapsed() {
  _state = DISP_LAPSED;
  _tft.fillScreen(COLOR_RED);
  _tft.setTextColor(COLOR_WHITE);
  _tft.setTextSize(2);
  _tft.setCursor(15, 65);
  _tft.print("Subscription");
  _tft.setCursor(45, 90);
  _tft.print("Expired");
  _tft.setTextSize(1);
  _tft.setCursor(15, 135);
  _tft.setTextColor(COLOR_WHITE);
  _tft.print("Renew at:");
  _tft.setCursor(20, 153);
  _tft.setTextColor(COLOR_AMBER);
  _tft.print("aicodeagency.org");
  _tft.setTextColor(COLOR_GRAY);
  _tft.setCursor(50, 190);
  _tft.print(DEVICE_ID);
}

void KiyannaDisplay::showError(const char* msg) {
  _state = DISP_ERROR;
  clear();
  _tft.fillRect(0, 0, 240, 40, COLOR_RED);
  _tft.setTextColor(COLOR_WHITE);
  _tft.setTextSize(2);
  _tft.setCursor(40, 10);
  _tft.print("Error");
  _tft.setTextSize(1);
  _tft.setTextColor(COLOR_GRAY);
  _tft.setTextWrap(true);
  _tft.setCursor(8, 60);
  _tft.print(msg);
  _tft.setTextColor(COLOR_DGRAY);
  _tft.setCursor(35, 165);
  _tft.print("Retrying in 10s...");
}

void KiyannaDisplay::update() {
  if (_state == DISP_PROCESSING) {
    unsigned long now = millis();
    if (now - _lastUpdate > 450) {
      _animStep = (_animStep + 1) % 4;
      _tft.fillRect(75, 138, 90, 18, COLOR_BG);
      _tft.setTextColor(COLOR_TEAL);
      _tft.setTextSize(2);
      _tft.setCursor(75, 138);
      for (int i = 0; i < _animStep; i++) _tft.print(".");
      _lastUpdate = now;
    }
  }
}

void KiyannaDisplay::clear(uint16_t color) {
  _tft.fillScreen(color);
}

void KiyannaDisplay::header(const char* title, uint16_t bg) {
  _tft.fillRect(0, 0, 240, 40, bg);
  _tft.setTextColor(COLOR_WHITE);
  _tft.setTextSize(2);
  int len = strlen(title);
  int x = (240 - len * 12) / 2;
  _tft.setCursor(x < 0 ? 4 : x, 10);
  _tft.print(title);
}

void KiyannaDisplay::centeredText(const char* text, int y, uint16_t color, uint8_t size) {
  _tft.setTextSize(size);
  _tft.setTextColor(color);
  int len = strlen(text);
  int x = (240 - len * 6 * size) / 2;
  _tft.setCursor(x < 0 ? 4 : x, y);
  _tft.print(text);
}
