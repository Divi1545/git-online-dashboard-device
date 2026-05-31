#pragma once
#include <Arduino.h>

// Initialize the ES8311 audio codec via I2C, then enable PA
// Call this AFTER Wire.begin() and BEFORE I2S setup
void es8311_init(uint32_t sample_rate);
