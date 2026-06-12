#pragma once
#include <Arduino.h>

// Initialize the ES8311 audio codec via I2C.
// Call AFTER I2S is started (so MCLK is toggling on GPIO16).
// Returns true if the ES8311 chip was found on the I2C bus and configured.
// Returns false if chip ID reads 0xFF (not connected / wrong pins / wrong address).
bool es8311_init(uint32_t sample_rate);
