#pragma once
#include <Arduino.h>
#include <driver/i2s_std.h>
#include "config.h"

#define AUDIO_BUFFER_SIZE  (SAMPLE_RATE * 2 * 5)  // 5s of 16-bit mono (80KB, fits in PSRAM)

class KiyannaAudio {
public:
  KiyannaAudio();
  void beginMic();      // initialize full-duplex ES8311 TX + RX on I2S_NUM_0
  void beginSpeaker();  // enable PA after codec DAC is stable

  // Recording — returns base64-encoded WAV
  String recordToBase64(int maxMs = RECORD_DURATION, int speechLevel = RECORD_SPEECH_LEVEL);

  // Playback (raw PCM or WAV)
  void playPCM(const uint8_t* data, size_t len);
  void stopPlayback();

  // Play a pure sine-wave tone — use to confirm speaker hardware works
  void playTone(int freqHz, int durationMs, int amplitude = 2000);

  // Direct I2S read for VAD — returns bytes read (stereo frames, caller extracts mono)
  size_t readRaw(void* buf, size_t bytes);

  bool isSilent(int16_t* samples, int count, int threshold = 200);

  // Public channel handles — needed for pre-codec dummy write in main.cpp
  i2s_chan_handle_t txChan = nullptr;
  i2s_chan_handle_t rxChan = nullptr;

private:
  uint8_t* _audioBuffer;
  size_t   _bufferFilled;

  void setupI2S();         // shared ES8311 bus: TX speaker + RX microphone ADC
  String toBase64(const uint8_t* data, size_t len);
  void writeWavHeader(uint8_t* buf, size_t dataSize);
};
