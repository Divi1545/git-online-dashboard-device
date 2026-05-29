#pragma once
#include <Adafruit_NeoPixel.h>
#include "config.h"

enum LedState {
  LED_IDLE,
  LED_LISTENING,
  LED_PROCESSING,
  LED_SPEAKING,
  LED_ALERT,
  LED_LAPSED,
  LED_ERROR,
  LED_BOOT,
  LED_CONNECTED
};

class KiyannaLED {
public:
  KiyannaLED();
  void begin();
  void setState(LedState state);
  void update();  // call in loop()
  LedState getState() { return _state; }
  void flash(uint32_t color, int times, int delayMs = 100);

private:
  Adafruit_NeoPixel _strip;
  LedState _state;
  unsigned long _lastUpdate;
  int _animStep;

  void setAll(uint32_t color);
  void breathe(uint8_t r, uint8_t g, uint8_t b, float phase);
  void spin(uint32_t color, int step);
  uint32_t color(uint8_t r, uint8_t g, uint8_t b);
};
