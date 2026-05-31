#pragma once
#include <Arduino.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <SPI.h>
#include "config.h"

// RGB565 colors
#define COLOR_BG      0x0000  // black
#define COLOR_TEAL    0x0CB0  // #0D9488 — correct RGB565 for teal accent
#define COLOR_WHITE   0xFFFF
#define COLOR_GRAY    0x7BEF
#define COLOR_DGRAY   0x4A49
#define COLOR_AMBER   0xFD20  // #F59E0B
#define COLOR_RED     0xF800  // #EF4444
#define COLOR_GREEN   0x07E0

enum DisplayState {
  DISP_BOOT, DISP_CONNECTING, DISP_IDLE,
  DISP_LISTENING, DISP_PROCESSING, DISP_SPEAKING,
  DISP_LAPSED, DISP_ERROR
};

class KiyannaDisplay {
public:
  KiyannaDisplay();
  void begin();
  void showBoot();
  void showConnecting(const char* ssid);
  void showIdle(const char* deviceId);
  void showListening();
  void showProcessing();
  void showSpeaking(const char* text);
  void showLapsed();
  void showError(const char* msg);
  void update();

private:
  Adafruit_ST7789 _tft;
  DisplayState _state;
  unsigned long _lastUpdate;
  int _animStep;

  void clear(uint16_t color = COLOR_BG);
  void header(const char* title = "Kiyanna AI", uint16_t bg = COLOR_TEAL);
  void centeredText(const char* text, int y, uint16_t color, uint8_t size = 2);
};
