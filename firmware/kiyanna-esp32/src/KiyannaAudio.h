#pragma once
#include <Arduino.h>
#include <driver/i2s.h>
#include "config.h"

#define AUDIO_BUFFER_SIZE  (SAMPLE_RATE * 2 * 2)  // 2s of 16-bit mono

class KiyannaAudio {
public:
  KiyannaAudio();
  void beginMic();
  void beginSpeaker();

  // Recording — returns base64-encoded WAV
  String recordToBase64(int maxMs = RECORD_DURATION);

  // Playback (raw PCM or WAV)
  void playPCM(const uint8_t* data, size_t len);
  void stopPlayback();

  // Direct I2S read for VAD — returns bytes read
  size_t readRaw(void* buf, size_t bytes);

  bool isSilent(int16_t* samples, int count, int threshold = 500);

private:
  uint8_t* _audioBuffer;
  size_t   _bufferFilled;

  void setupI2S();
  String toBase64(const uint8_t* data, size_t len);
  void writeWavHeader(uint8_t* buf, size_t dataSize);
};
