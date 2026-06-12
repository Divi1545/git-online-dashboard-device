#include "KiyannaAudio.h"

static const char b64chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

KiyannaAudio::KiyannaAudio() : _audioBuffer(nullptr), _bufferFilled(0) {}

// The ES8311 speaker DAC and microphone ADC share BCLK, WS, and MCLK.
// Allocate both directions together so ESP-IDF keeps them on one controller.
void KiyannaAudio::setupI2S() {
  i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
  chan_cfg.auto_clear = true;
  esp_err_t err = i2s_new_channel(&chan_cfg, &txChan, &rxChan);
  if (err != ESP_OK) {
    Serial.printf("[AUDIO] i2s_new_channel failed: %s\n", esp_err_to_name(err));
    txChan = nullptr;
    rxChan = nullptr;
    return;
  }

  i2s_std_config_t std_cfg = {
    .clk_cfg  = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO),
    .gpio_cfg = {
      .mclk = (gpio_num_t)I2S_MCLK,  // GPIO16 — ES8311 needs MCLK before init
      .bclk = (gpio_num_t)I2S_BCLK,  // GPIO9
      .ws   = (gpio_num_t)I2S_WS,    // GPIO45
      .dout = (gpio_num_t)I2S_DOUT,  // GPIO8 → ES8311 DIN
      .din  = (gpio_num_t)I2S_DIN,   // GPIO10 ← ES8311 DOUT
      .invert_flags = { .mclk_inv = false, .bclk_inv = false, .ws_inv = false },
    },
  };
  std_cfg.clk_cfg.mclk_multiple = I2S_MCLK_MULTIPLE_256;

  err = i2s_channel_init_std_mode(txChan, &std_cfg);
  if (err == ESP_OK) err = i2s_channel_init_std_mode(rxChan, &std_cfg);
  if (err == ESP_OK) err = i2s_channel_enable(txChan);
  if (err == ESP_OK) err = i2s_channel_enable(rxChan);
  if (err != ESP_OK) {
    Serial.printf("[AUDIO] I2S init failed: %s\n", esp_err_to_name(err));
    return;
  }
  Serial.printf("[AUDIO] ES8311 I2S ready (TX=GPIO%d RX=GPIO%d MCLK=GPIO%d)\n",
                I2S_DOUT, I2S_DIN, I2S_MCLK);
}

void KiyannaAudio::beginMic() {
  setupI2S();  // starts MCLK before the codec register setup

  size_t bufSize = AUDIO_BUFFER_SIZE + 44;
  _audioBuffer = (uint8_t*)ps_malloc(bufSize);
  if (!_audioBuffer) {
    Serial.println("[AUDIO] PSRAM alloc failed — using DRAM");
    _audioBuffer = (uint8_t*)malloc(bufSize);
  }
  if (_audioBuffer) Serial.printf("[AUDIO] Buffer: %u bytes\n", (unsigned)bufSize);
  else               Serial.println("[AUDIO] FATAL: buffer alloc failed");

}

void KiyannaAudio::beginSpeaker() {
  // PA enabled after codec DAC is stable — avoids startup pop.
  pinMode(CODEC_PA_PIN, OUTPUT);
  delay(50);
  digitalWrite(CODEC_PA_PIN, HIGH);
  Serial.println("[AUDIO] Speaker PA enabled (GPIO46)");
}

size_t KiyannaAudio::readRaw(void* buf, size_t bytes) {
  if (!rxChan) return 0;
  size_t bytesRead = 0;
  esp_err_t err = i2s_channel_read(rxChan, buf, bytes, &bytesRead, pdMS_TO_TICKS(50));
  if (err != ESP_OK && err != ESP_ERR_TIMEOUT) {
    Serial.printf("[AUDIO] I2S read failed: %s\n", esp_err_to_name(err));
  }
  return bytesRead;
}

// ES8311 output is stereo-framed even though its ADC is mono.
String KiyannaAudio::recordToBase64(int maxMs, int speechLevel) {
  if (!_audioBuffer || !rxChan) return "";

  size_t headerSize = 44;
  uint8_t* dataBuf  = _audioBuffer + headerSize;
  size_t maxData    = AUDIO_BUFFER_SIZE;
  size_t totalRead  = 0;

  unsigned long startTime = millis();
  unsigned long lastSound = 0;
  bool heardSpeech        = false;
  int peakEnergy          = speechLevel;

  static DRAM_ATTR int16_t stereoReadBuf[256];  // 128 stereo frames; DMA needs DRAM
  Serial.printf("[AUDIO] Recording (max %dms, speech level %d, ES8311 ADC GPIO%d)...\n",
                maxMs, speechLevel, I2S_DIN);

  while (millis() - startTime < (unsigned long)maxMs) {
    size_t bytesRead = 0;
    esp_err_t err = i2s_channel_read(rxChan, stereoReadBuf, sizeof(stereoReadBuf),
                                     &bytesRead, pdMS_TO_TICKS(100));
    if (err != ESP_OK && err != ESP_ERR_TIMEOUT) {
      Serial.printf("[AUDIO] Recording read failed: %s\n", esp_err_to_name(err));
      break;
    }

    if (bytesRead > 0) {
      int frames = bytesRead / 4;  // 4 bytes per stereo frame
      if (totalRead + (size_t)(frames * 2) > maxData) break;

      // The codec may place its mono ADC in either slot. Choose the slot with
      // more AC energy so a board/codec slot setting cannot produce silence.
      int64_t leftEnergy = 0;
      int64_t rightEnergy = 0;
      for (int j = 1; j < frames; j++) {
        leftEnergy += abs((int32_t)stereoReadBuf[j * 2] - stereoReadBuf[(j - 1) * 2]);
        rightEnergy += abs((int32_t)stereoReadBuf[j * 2 + 1] - stereoReadBuf[(j - 1) * 2 + 1]);
      }
      int slot = rightEnergy > leftEnergy ? 1 : 0;
      int16_t* dst = (int16_t*)(dataBuf + totalRead);
      for (int j = 0; j < frames; j++) {
        dst[j] = stereoReadBuf[j * 2 + slot];
      }
      totalRead += frames * 2;

      int64_t mean = 0;
      for (int j = 0; j < frames; j++) mean += dst[j];
      mean /= frames;
      int64_t energySum = 0;
      for (int j = 0; j < frames; j++) {
        energySum += abs((int32_t)dst[j] - (int32_t)mean);
      }
      int energy = (int)(energySum / frames);
      peakEnergy = max(peakEnergy, energy);
      int dynamicSpeechLevel = max(speechLevel, peakEnergy * 40 / 100);

      if (energy >= dynamicSpeechLevel) {
        lastSound    = millis();
        heardSpeech  = true;
      } else if (heardSpeech && millis() - lastSound > SILENCE_TIMEOUT) {
        Serial.printf("[AUDIO] Post-speech silence — stopping (level=%d peak=%d)\n",
                      energy, peakEnergy);
        break;
      }
    }
  }

  if (totalRead == 0) {
    Serial.printf("[AUDIO] No data from ES8311 mic — check GPIO%d and codec config\n", I2S_DIN);
    return "";
  }
  if (!heardSpeech) {
    Serial.println("[AUDIO] Only silence recorded");
    return "";
  }

  writeWavHeader(_audioBuffer, totalRead);
  _bufferFilled = totalRead + headerSize;
  Serial.printf("[AUDIO] Recorded %u bytes PCM (%dms)\n",
                (unsigned)totalRead, (int)(millis() - startTime));
  return toBase64(_audioBuffer, _bufferFilled);
}

// Expand mono WAV PCM to stereo for ES8311 DAC. Skip WAV header if present.
void KiyannaAudio::playPCM(const uint8_t* data, size_t len) {
  if (!txChan || !data || len < 2) return;
  size_t offset = 0;
  if (len > 44 && data[0]=='R' && data[1]=='I' && data[2]=='F' && data[3]=='F') {
    offset = 44;
  }

  static DRAM_ATTR int16_t sBuf[1024];  // 512 stereo frames; DMA needs DRAM
  const int16_t* src    = (const int16_t*)(data + offset);
  size_t monoSamples    = (len - offset) / 2;
  size_t i              = 0;

  while (i < monoSamples) {
    size_t frames = min((size_t)512, monoSamples - i);
    for (size_t f = 0; f < frames; f++) {
      // Scale to 60% to avoid clipping through ES8311 DAC + PA
      int16_t s = (int16_t)((int32_t)src[i + f] * 6 / 10);
      sBuf[f * 2]     = s;  // L
      sBuf[f * 2 + 1] = s;  // R
    }
    size_t written = 0;
    esp_err_t err = i2s_channel_write(txChan, sBuf, frames * 4,
                                      &written, pdMS_TO_TICKS(1000));
    if (err != ESP_OK || written == 0) {
      Serial.printf("[AUDIO] Playback write failed: %s (%u bytes)\n",
                    esp_err_to_name(err), (unsigned)written);
      break;
    }
    i += written / 4;
  }
}

void KiyannaAudio::stopPlayback() {
  if (!txChan) return;
  static DRAM_ATTR int16_t zeros[64] = {};
  size_t w = 0;
  i2s_channel_write(txChan, zeros, sizeof(zeros), &w, pdMS_TO_TICKS(50));
}

void KiyannaAudio::playTone(int freqHz, int durationMs, int amplitude) {
  if (!txChan) return;
  static DRAM_ATTR int16_t buf[512];
  int totalSamples = SAMPLE_RATE * durationMs / 1000;
  int i = 0;
  while (i < totalSamples) {
    int chunk = min(256, totalSamples - i);
    for (int j = 0; j < chunk; j++) {
      float t = (float)(i + j) / SAMPLE_RATE;
      int16_t s = (int16_t)(amplitude * sin(2.0f * 3.14159265f * freqHz * t));
      buf[j * 2]     = s;
      buf[j * 2 + 1] = s;
    }
    size_t written = 0;
    esp_err_t err = i2s_channel_write(txChan, buf, chunk * 4, &written, pdMS_TO_TICKS(500));
    if (err != ESP_OK || written == 0) {
      Serial.printf("[AUDIO] Tone write failed: %s (%u bytes)\n",
                    esp_err_to_name(err), (unsigned)written);
      break;
    }
    i += written / 4;
  }
}

bool KiyannaAudio::isSilent(int16_t* samples, int count, int threshold) {
  if (!samples || count <= 0) return true;
  // Remove codec/microphone DC bias before measuring speech energy.
  long mean = 0;
  for (int i = 0; i < count; i++) mean += samples[i];
  mean /= count;
  long energy = 0;
  for (int i = 0; i < count; i++) energy += abs(samples[i] - (int16_t)mean);
  return (energy / count) < threshold;
}

void KiyannaAudio::writeWavHeader(uint8_t* buf, size_t dataSize) {
  uint32_t totalSize = dataSize + 36;
  uint32_t byteRate  = SAMPLE_RATE * 2;
  memcpy(buf,      "RIFF", 4); memcpy(buf+4,  &totalSize, 4);
  memcpy(buf+8,    "WAVE", 4); memcpy(buf+12, "fmt ", 4);
  uint32_t s1=16; memcpy(buf+16, &s1, 4);
  uint16_t af=1;  memcpy(buf+20, &af, 2);
  uint16_t ch=1;  memcpy(buf+22, &ch, 2);
  uint32_t sr=SAMPLE_RATE; memcpy(buf+24, &sr, 4);
  memcpy(buf+28, &byteRate, 4);
  uint16_t ba=2;  memcpy(buf+32, &ba, 2);
  uint16_t bps=16; memcpy(buf+34, &bps, 2);
  memcpy(buf+36, "data", 4); memcpy(buf+40, &dataSize, 4);
}

String KiyannaAudio::toBase64(const uint8_t* data, size_t len) {
  String result;
  result.reserve((len / 3 + 1) * 4 + 4);
  for (size_t i = 0; i < len; i += 3) {
    uint8_t b0=data[i], b1=(i+1<len)?data[i+1]:0, b2=(i+2<len)?data[i+2]:0;
    result += b64chars[b0>>2];
    result += b64chars[((b0&3)<<4)|(b1>>4)];
    result += (i+1<len) ? b64chars[((b1&0xF)<<2)|(b2>>6)] : '=';
    result += (i+2<len) ? b64chars[b2&0x3F] : '=';
  }
  return result;
}
