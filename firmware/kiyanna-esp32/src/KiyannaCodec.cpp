/*
 * ES8311 codec init — register sequence derived from Espressif's official
 * esp-idf/components/esp_codec_dev es8311.c driver (Apache-2.0).
 *
 * Key fixes vs the old hand-rolled init:
 *   - REG0E = 0x02 (enable analog PGA + ADC modulator) — was missing → mic = zeros
 *   - REG12 = 0x00 (power up DAC)                     — was missing → speaker silent
 *   - REG09/0A = 0x0C (16-bit I2S)                    — was 0x60 (wrong field)
 *   - REG14 = 0x1A (analog MIC, max PGA)               — was 0x47 (wrong)
 *   - REG17 = 0xFF (ADC digital volume = max)          — was 0xBF
 */
#include "KiyannaCodec.h"
#include "config.h"
#include <Wire.h>

#define ES8311_ADDR CODEC_ADDR  // 0x18

static void rw(uint8_t reg, uint8_t val) {
    Wire.beginTransmission(ES8311_ADDR);
    Wire.write(reg);
    Wire.write(val);
    Wire.endTransmission();
}

static uint8_t rr(uint8_t reg) {
    Wire.beginTransmission(ES8311_ADDR);
    Wire.write(reg);
    Wire.endTransmission(true);
    Wire.requestFrom((uint8_t)ES8311_ADDR, (uint8_t)1);
    return Wire.available() ? Wire.read() : 0xFF;
}

bool es8311_init(uint32_t sample_rate) {
    (void)sample_rate;  // fixed for 16 kHz below

    Wire.begin(CODEC_I2C_SDA, CODEC_I2C_SCL, 400000);

    uint8_t id1 = rr(0xFD), id2 = rr(0xFE);
    Serial.printf("[CODEC] ES8311 ID: 0x%02X 0x%02X\n", id1, id2);
    if (id1 == 0xFF && id2 == 0xFF) {
        Serial.printf("[CODEC] NOT FOUND on SDA=%d SCL=%d\n",
                      CODEC_I2C_SDA, CODEC_I2C_SCL);
        return false;
    }

    // ── Power-on sequence from Espressif's esp_codec_dev ES8311 driver ──────
    rw(0x0D, 0xFA);
    rw(0x44, 0x08);   // improve I2C noise immunity; keep DAC-to-ADC test off
    rw(0x44, 0x08);   // ES8311 occasionally ignores the first write
    rw(0x01, 0x30);
    rw(0x02, 0x00);
    rw(0x03, 0x10);
    rw(0x16, 0x24);
    rw(0x04, 0x10);
    rw(0x05, 0x00);
    rw(0x0B, 0x00);
    rw(0x0C, 0x00);
    rw(0x10, 0x1F);
    rw(0x11, 0x7F);
    rw(0x00, 0x80);   // power on, slave mode

    // ── Clock: MCLK pin (GPIO16), 4.096 MHz = 16 kHz × 256 ──────────────────
    // REG01: bit7=0 = use MCLK pin, bit6=0 = not inverted, bits[5:0]=0x3F = enable all clocks
    rw(0x01, 0x3F);

    // Clock dividers for MCLK=4 096 000 Hz, sample=16 000 Hz
    // coeff_div entry: {4096000, 16000, pre_div=1, pre_multi=0, adc_div=1, dac_div=1,
    //                   fs_mode=0, lrck_h=0, lrck_l=0xFF, bclk_div=4, adc_osr=16, dac_osr=16}
    rw(0x02, 0x00);   // pre_div=1 (field=0), pre_multi=1× (field=0)
    rw(0x03, 0x10);   // fs_mode=0 (single speed), adc_osr=16
    rw(0x04, 0x10);   // dac_osr=16
    rw(0x05, 0x00);   // adc_div=1 (field=0), dac_div=1 (field=0)
    rw(0x06, (rr(0x06) & 0xE0) | 0x03);  // bclk_div = 4 → field = 4-1 = 3
    rw(0x07, (rr(0x07) & 0xC0) | 0x00);  // lrck_h
    rw(0x08, 0xFF);   // lrck_l  (LRCK = MCLK / (256 × 1) = 16 000 Hz)

    // ── Serial digital port format: 16-bit Philips I2S, slave ────────────────
    // bits[5:2] = 0011 = 16-bit; bits[1:0] = 00 = standard I2S
    rw(0x09, 0x0C);   // SDP In  (DAC receives from ESP32 TX)
    rw(0x0A, 0x0C);   // SDP Out (ADC sends to ESP32 RX)

    // ── Slave mode (ESP32 drives BCLK/WS) ───────────────────────────────────
    // Read REG00 and clear bit6 = slave mode
    rw(0x00, rr(0x00) & 0xBF);

    // ── Power management ─────────────────────────────────────────────────────
    rw(0x0D, 0x01);   // power up analog circuitry
    rw(0x0E, 0x02);   // enable analog PGA + enable ADC modulator  ← KEY for mic
    rw(0x12, 0x00);   // power up DAC                              ← KEY for speaker
    rw(0x13, 0x10);   // enable output to headphone driver

    // ── Microphone (analog, LINPUT1 single-ended) ────────────────────────────
    rw(0x14, 0x1A);   // analog MIC input, max PGA gain (official: 0x1A = AMIC + max PGA)
    rw(0x15, 0x40);   // start ADC and set ramp rate
    rw(0x16, 0x07);   // 42 dB analog microphone gain
    rw(0x17, 0xBF);   // ADC digital volume
    rw(0x1B, 0x0A);   // ADC high-pass filter
    rw(0x1C, 0x6A);   // ADC equalizer bypass, cancel DC offset

    // ── Speaker DAC ──────────────────────────────────────────────────────────
    rw(0x37, 0x08);   // bypass DAC equalizer
    rw(0x45, 0x00);
    rw(0x31, 0x00);   // DAC unmute
    rw(0x32, 0xBF);   // DAC digital volume ~0 dB

    // ── Readback verification ─────────────────────────────────────────────────
    Serial.printf("[CODEC] clk:  r01=0x%02X r02=0x%02X r06=0x%02X\n",
                  rr(0x01), rr(0x02), rr(0x06));
    Serial.printf("[CODEC] sdp:  r09=0x%02X(DAC) r0A=0x%02X(ADC)\n",
                  rr(0x09), rr(0x0A));
    Serial.printf("[CODEC] pwr:  r0D=0x%02X r0E=0x%02X r12=0x%02X r13=0x%02X\n",
                  rr(0x0D), rr(0x0E), rr(0x12), rr(0x13));
    Serial.printf("[CODEC] mic:  r14=0x%02X r17=0x%02X r1C=0x%02X\n",
                  rr(0x14), rr(0x17), rr(0x1C));
    Serial.printf("[CODEC] dac:  r31=0x%02X r32=0x%02X r37=0x%02X\n",
                  rr(0x31), rr(0x32), rr(0x37));
    Serial.println("[CODEC] ES8311 ready");
    return true;
}
