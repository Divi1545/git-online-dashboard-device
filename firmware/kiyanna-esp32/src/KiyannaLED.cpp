#include "KiyannaLED.h"
#include <math.h>

KiyannaLED::KiyannaLED()
  : _strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800),
    _state(LED_BOOT), _lastUpdate(0), _animStep(0) {}

void KiyannaLED::begin() {
  _strip.begin();
  _strip.setBrightness(80);
  _strip.show();
}

void KiyannaLED::setState(LedState state) {
  _state = state;
  _animStep = 0;
  _lastUpdate = 0;
}

void KiyannaLED::update() {
  unsigned long now = millis();

  switch (_state) {
    case LED_IDLE: {
      // Slow blue breathing, 2s cycle
      if (now - _lastUpdate > 20) {
        float phase = (now % 2000) / 2000.0f;
        breathe(0, 80, 255, phase);
        _lastUpdate = now;
      }
      break;
    }
    case LED_LISTENING: {
      // Solid blue
      setAll(color(0, 100, 255));
      break;
    }
    case LED_PROCESSING: {
      // Fast blue pulse, 0.3s cycle
      if (now - _lastUpdate > 15) {
        float phase = (now % 300) / 300.0f;
        breathe(0, 100, 255, phase);
        _lastUpdate = now;
      }
      break;
    }
    case LED_SPEAKING: {
      // Green glow with subtle breathing
      if (now - _lastUpdate > 20) {
        float phase = (now % 1500) / 1500.0f;
        breathe(0, 200, 80, phase * 0.3f + 0.7f);
        _lastUpdate = now;
      }
      break;
    }
    case LED_ALERT: {
      // Amber flash
      if (now - _lastUpdate > 200) {
        _animStep++;
        if (_animStep % 2 == 0) {
          setAll(color(245, 158, 11));
        } else {
          setAll(0);
        }
        _lastUpdate = now;
        if (_animStep >= 6) {
          setState(LED_IDLE);
        }
      }
      break;
    }
    case LED_LAPSED: {
      // Solid red
      setAll(color(239, 68, 68));
      break;
    }
    case LED_ERROR: {
      // Rapid red flash
      if (now - _lastUpdate > 100) {
        _animStep++;
        setAll(_animStep % 2 == 0 ? color(239, 68, 68) : 0);
        _lastUpdate = now;
      }
      break;
    }
    case LED_BOOT: {
      // Rainbow spin
      if (now - _lastUpdate > 30) {
        spin(_strip.ColorHSV(_animStep * 4096, 255, 150), _animStep % LED_COUNT);
        _animStep++;
        _lastUpdate = now;
      }
      break;
    }
    case LED_CONNECTED: {
      // Single green flash then go idle
      if (_animStep == 0) {
        setAll(color(0, 200, 80));
        _animStep = 1;
        _lastUpdate = now;
      } else if (now - _lastUpdate > 500) {
        setState(LED_IDLE);
      }
      break;
    }
  }
}

void KiyannaLED::flash(uint32_t c, int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    setAll(c);
    delay(delayMs);
    setAll(0);
    delay(delayMs);
  }
}

void KiyannaLED::setAll(uint32_t c) {
  for (int i = 0; i < LED_COUNT; i++) _strip.setPixelColor(i, c);
  _strip.show();
}

void KiyannaLED::breathe(uint8_t r, uint8_t g, uint8_t b, float phase) {
  float brightness = (sin(phase * 2 * PI - PI / 2) + 1.0f) / 2.0f;
  brightness = 0.1f + brightness * 0.9f;
  setAll(color((uint8_t)(r * brightness), (uint8_t)(g * brightness), (uint8_t)(b * brightness)));
}

void KiyannaLED::spin(uint32_t c, int step) {
  setAll(0);
  for (int i = 0; i < 4; i++) {
    _strip.setPixelColor((step + i) % LED_COUNT, c);
  }
  _strip.show();
}

uint32_t KiyannaLED::color(uint8_t r, uint8_t g, uint8_t b) {
  return _strip.Color(r, g, b);
}
