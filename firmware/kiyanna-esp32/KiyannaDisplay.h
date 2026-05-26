#pragma once
#include <TFT_eSPI.h>
#include "config.h"

enum DisplayState {
  DISP_BOOT,
  DISP_CONNECTING,
  DISP_IDLE,
  DISP_LISTENING,
  DISP_PROCESSING,
  DISP_SPEAKING,
  DISP_LAPSED,
  DISP_ERROR
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
  void update();  // for animated states

private:
  TFT_eSPI _tft;
  DisplayState _state;
  unsigned long _lastUpdate;
  int _animStep;
  String _deviceId;
  String _speakText;

  void clear(uint16_t color = TFT_BLACK);
  void drawHeader();
  void drawCenteredText(const char* text, int y, uint16_t color, uint8_t size = 2);
  void drawWrappedText(const String& text, int x, int y, int maxWidth, uint16_t color);
  uint16_t rgb(uint8_t r, uint8_t g, uint8_t b);
};
