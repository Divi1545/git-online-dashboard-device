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

  // Recording
  bool startRecording();
  void stopRecording();
  bool isRecording() { return _recording; }
  uint8_t* getBuffer() { return _audioBuffer; }
  size_t getBufferSize() { return _bufferFilled; }

  // Returns base64-encoded WAV
  String recordToBase64(int maxMs = RECORD_DURATION);

  // Playback (simple PCM)
  void playPCM(const uint8_t* data, size_t len);
  void stopPlayback();

  bool isSilent(int16_t* samples, int count, int threshold = 500);

private:
  bool _recording;
  uint8_t* _audioBuffer;
  size_t _bufferFilled;

  void setupMicI2S();
  void setupSpeakerI2S();
  String toBase64(const uint8_t* data, size_t len);
  void writeWavHeader(uint8_t* buf, size_t dataSize);
};
