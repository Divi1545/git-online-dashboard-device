#include "KiyannaAudio.h"

static const char b64chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

KiyannaAudio::KiyannaAudio() : _audioBuffer(nullptr), _bufferFilled(0) {}

void KiyannaAudio::setupI2S() {
  // Full-duplex I2S for ES8311 codec (mic ADC via RX, speaker DAC via TX).
  // RIGHT_LEFT (stereo) format required for reliable full-duplex in this framework.
  // fixed_mclk=0: lets mclk_multiple control MCLK frequency (4.096 MHz = 256×16kHz).
  // Note: SOC_I2S_SUPPORTS_MCLK_OUTPUT is NOT defined for ESP32-S3 in this
  // Arduino v2.0.x framework — the MCLK GPIO is unreliable. ES8311 is therefore
  // configured to use BCLK as its reference clock (KiyannaCodec.cpp reg 0x01 bit7=1).
  i2s_config_t cfg = {
    .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX | I2S_MODE_RX),
    .sample_rate          = SAMPLE_RATE,
    .bits_per_sample      = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format       = I2S_CHANNEL_FMT_RIGHT_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count        = 8,
    .dma_buf_len          = 512,
    .use_apll             = false,
    .tx_desc_auto_clear   = true,
    .fixed_mclk           = 0,
    .mclk_multiple        = I2S_MCLK_MULTIPLE_256,
  };
  i2s_pin_config_t pins = {
    .mck_io_num   = I2S_MCLK,
    .bck_io_num   = I2S_BCLK,
    .ws_io_num    = I2S_WS,
    .data_out_num = I2S_DOUT,
    .data_in_num  = I2S_DIN,
  };
  i2s_driver_install(I2S_PORT, &cfg, 0, NULL);
  i2s_set_pin(I2S_PORT, &pins);
}

void KiyannaAudio::beginMic() {
  setupI2S();
  size_t bufSize = AUDIO_BUFFER_SIZE + 44;
  _audioBuffer = (uint8_t*)ps_malloc(bufSize);
  if (!_audioBuffer) {
    Serial.println("[AUDIO] PSRAM alloc failed — falling back to DRAM");
    _audioBuffer = (uint8_t*)malloc(bufSize);
  }
  if (_audioBuffer) {
    Serial.printf("[AUDIO] Buffer: %u bytes @ 0x%08x\n", (unsigned)bufSize, (unsigned)_audioBuffer);
  } else {
    Serial.println("[AUDIO] FATAL: audio buffer alloc failed");
  }
  Serial.println("[AUDIO] I2S ready");
}

void KiyannaAudio::beginSpeaker() {
  // PA enabled after codec DAC is stable — avoids startup pop.
  pinMode(CODEC_PA_PIN, OUTPUT);
  delay(50);
  digitalWrite(CODEC_PA_PIN, HIGH);
  i2s_zero_dma_buffer(I2S_PORT);
  Serial.println("[AUDIO] Speaker PA enabled");
}

size_t KiyannaAudio::readRaw(void* buf, size_t bytes) {
  size_t bytesRead = 0;
  i2s_read(I2S_PORT, buf, bytes, &bytesRead, pdMS_TO_TICKS(50));
  return bytesRead;
}

String KiyannaAudio::recordToBase64(int maxMs) {
  if (!_audioBuffer) return "";

  size_t headerSize = 44;
  uint8_t* dataBuf = _audioBuffer + headerSize;
  size_t maxDataSize = AUDIO_BUFFER_SIZE;
  size_t totalRead = 0;

  unsigned long startTime = millis();
  unsigned long lastSound = millis();
  // Stereo buffer: RIGHT_LEFT interleaved [L, R, L, R, ...]
  // DRAM_ATTR: I2S DMA cannot write to PSRAM
  static DRAM_ATTR int16_t stereoReadBuf[256];

  Serial.println("[AUDIO] Recording...");

  while (millis() - startTime < (unsigned long)maxMs) {
    size_t bytesRead = 0;
    i2s_read(I2S_PORT, stereoReadBuf, sizeof(stereoReadBuf), &bytesRead, pdMS_TO_TICKS(100));

    if (bytesRead > 0) {
      // Extract L-channel only (even indices) — ES8311 ADC outputs mic on L
      int frames = bytesRead / 4;
      if (totalRead + (size_t)(frames * 2) > maxDataSize) break;
      int16_t* dst = (int16_t*)(dataBuf + totalRead);
      for (int j = 0; j < frames; j++) {
        dst[j] = stereoReadBuf[j * 2];
      }
      size_t monoBytes = frames * 2;
      totalRead += monoBytes;

      if (!isSilent(dst, frames)) {
        lastSound = millis();
      } else if (millis() - lastSound > SILENCE_TIMEOUT && totalRead > SAMPLE_RATE) {
        Serial.println("[AUDIO] Silence detected, stopping");
        break;
      }
    }
  }

  if (totalRead == 0) return "";

  writeWavHeader(_audioBuffer, totalRead);
  _bufferFilled = totalRead + headerSize;

  Serial.printf("[AUDIO] Recorded %d bytes (%dms)\n", totalRead, (int)(millis() - startTime));
  return toBase64(_audioBuffer, _bufferFilled);
}

void KiyannaAudio::playPCM(const uint8_t* data, size_t len) {
  i2s_zero_dma_buffer(I2S_PORT);
  size_t written = 0;
  size_t offset = 0;
  if (len > 44 && data[0] == 'R' && data[1] == 'I' && data[2] == 'F' && data[3] == 'F') {
    offset = 44;
  }
  while (offset < len) {
    size_t chunk = min((size_t)4096, len - offset);
    esp_err_t err = i2s_write(I2S_PORT, data + offset, chunk, &written, pdMS_TO_TICKS(1000));
    if (err != ESP_OK || written == 0) break;
    offset += written;
  }
}

void KiyannaAudio::stopPlayback() {
  i2s_zero_dma_buffer(I2S_PORT);
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
  uint16_t audioFormat = 1;
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
