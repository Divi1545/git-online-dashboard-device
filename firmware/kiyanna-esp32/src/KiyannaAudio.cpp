#include "KiyannaAudio.h"

// Simple Base64 lookup
static const char b64chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

KiyannaAudio::KiyannaAudio() : _recording(false), _bufferFilled(0) {
  _audioBuffer = (uint8_t*)ps_malloc(AUDIO_BUFFER_SIZE + 44);  // +44 for WAV header
  if (!_audioBuffer) {
    Serial.println("[AUDIO] PSRAM allocation failed! Using DRAM.");
    _audioBuffer = (uint8_t*)malloc(16000);  // fallback 1s
  }
}

void KiyannaAudio::setupMicI2S() {
  i2s_config_t cfg = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 1024,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };
  i2s_pin_config_t pins = {
    .bck_io_num = I2S_MIC_SCK,
    .ws_io_num = I2S_MIC_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_MIC_SD
  };
  i2s_driver_install(I2S_MIC_PORT, &cfg, 0, NULL);
  i2s_set_pin(I2S_MIC_PORT, &pins);
}

void KiyannaAudio::setupSpeakerI2S() {
  i2s_config_t cfg = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = 22050,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 1024,
    .use_apll = false,
    .tx_desc_auto_clear = true,
    .fixed_mclk = 0
  };
  i2s_pin_config_t pins = {
    .bck_io_num = I2S_SPK_BCLK,
    .ws_io_num = I2S_SPK_LRCLK,
    .data_out_num = I2S_SPK_DOUT,
    .data_in_num = I2S_PIN_NO_CHANGE
  };
  i2s_driver_install(I2S_SPK_PORT, &cfg, 0, NULL);
  i2s_set_pin(I2S_SPK_PORT, &pins);
}

void KiyannaAudio::beginMic() {
  setupMicI2S();
  Serial.println("[AUDIO] Mic I2S ready");
}

void KiyannaAudio::beginSpeaker() {
  setupSpeakerI2S();
  Serial.println("[AUDIO] Speaker I2S ready");
}

String KiyannaAudio::recordToBase64(int maxMs) {
  if (!_audioBuffer) return "";

  size_t headerSize = 44;
  uint8_t* dataBuf = _audioBuffer + headerSize;
  size_t maxDataSize = AUDIO_BUFFER_SIZE;
  size_t totalRead = 0;

  unsigned long startTime = millis();
  unsigned long lastSound = millis();
  int16_t readBuf[512];
  size_t bytesRead = 0;

  Serial.println("[AUDIO] Recording...");

  while (millis() - startTime < (unsigned long)maxMs) {
    i2s_read(I2S_MIC_PORT, readBuf, sizeof(readBuf), &bytesRead, portMAX_DELAY);

    if (bytesRead > 0 && totalRead + bytesRead <= maxDataSize) {
      memcpy(dataBuf + totalRead, readBuf, bytesRead);
      totalRead += bytesRead;

      // Silence detection
      if (!isSilent(readBuf, bytesRead / 2)) {
        lastSound = millis();
      } else if (millis() - lastSound > SILENCE_TIMEOUT && totalRead > SAMPLE_RATE) {
        Serial.println("[AUDIO] Silence detected, stopping");
        break;
      }
    }
  }

  if (totalRead == 0) return "";

  // Write WAV header
  writeWavHeader(_audioBuffer, totalRead);
  _bufferFilled = totalRead + headerSize;

  Serial.printf("[AUDIO] Recorded %d bytes (%dms)\n", totalRead, millis() - startTime);
  return toBase64(_audioBuffer, _bufferFilled);
}

void KiyannaAudio::playPCM(const uint8_t* data, size_t len) {
  size_t written = 0;
  size_t offset = 0;
  // Skip WAV header if present
  if (len > 44 && data[0] == 'R' && data[1] == 'I' && data[2] == 'F' && data[3] == 'F') {
    offset = 44;
  }
  while (offset < len) {
    size_t chunk = min((size_t)4096, len - offset);
    i2s_write(I2S_SPK_PORT, data + offset, chunk, &written, portMAX_DELAY);
    offset += written;
  }
}

void KiyannaAudio::stopPlayback() {
  i2s_zero_dma_buffer(I2S_SPK_PORT);
}

bool KiyannaAudio::isSilent(int16_t* samples, int count, int threshold) {
  long sum = 0;
  for (int i = 0; i < count; i++) {
    sum += abs(samples[i]);
  }
  return (sum / count) < threshold;
}

void KiyannaAudio::writeWavHeader(uint8_t* buf, size_t dataSize) {
  uint32_t totalSize = dataSize + 36;
  uint32_t byteRate = SAMPLE_RATE * 2;

  memcpy(buf, "RIFF", 4);
  memcpy(buf + 4, &totalSize, 4);
  memcpy(buf + 8, "WAVE", 4);
  memcpy(buf + 12, "fmt ", 4);
  uint32_t subChunk1Size = 16;
  memcpy(buf + 16, &subChunk1Size, 4);
  uint16_t audioFormat = 1;   // PCM
  memcpy(buf + 20, &audioFormat, 2);
  uint16_t channels = 1;
  memcpy(buf + 22, &channels, 2);
  uint32_t sampleRate = SAMPLE_RATE;
  memcpy(buf + 24, &sampleRate, 4);
  memcpy(buf + 28, &byteRate, 4);
  uint16_t blockAlign = 2;
  memcpy(buf + 32, &blockAlign, 2);
  uint16_t bitsPerSample = 16;
  memcpy(buf + 34, &bitsPerSample, 2);
  memcpy(buf + 36, "data", 4);
  memcpy(buf + 40, &dataSize, 4);
}

String KiyannaAudio::toBase64(const uint8_t* data, size_t len) {
  String result;
  result.reserve((len / 3 + 1) * 4 + 4);

  for (size_t i = 0; i < len; i += 3) {
    uint8_t b0 = data[i];
    uint8_t b1 = (i + 1 < len) ? data[i + 1] : 0;
    uint8_t b2 = (i + 2 < len) ? data[i + 2] : 0;

    result += b64chars[b0 >> 2];
    result += b64chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += (i + 1 < len) ? b64chars[((b1 & 0xF) << 2) | (b2 >> 6)] : '=';
    result += (i + 2 < len) ? b64chars[b2 & 0x3F] : '=';
  }
  return result;
}
