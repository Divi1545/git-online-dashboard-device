#include "KiyannaCloud.h"

KiyannaCloud::KiyannaCloud() {}

// HTTPClient::writeToStream() decodes both Content-Length and chunked bodies.
// Vercel TTS responses are chunked, so reading the raw WiFiClient returns no
// usable payload on some Arduino-ESP32 versions.
class FixedBufferStream : public Stream {
public:
  FixedBufferStream(uint8_t* buffer, size_t capacity)
      : _buffer(buffer), _capacity(capacity), _size(0), _overflow(false) {}

  size_t write(uint8_t value) override {
    return write(&value, 1);
  }

  size_t write(const uint8_t* data, size_t len) override {
    size_t room = _capacity - _size;
    size_t copyLen = min(room, len);
    if (copyLen > 0) {
      memcpy(_buffer + _size, data, copyLen);
      _size += copyLen;
    }
    if (copyLen != len) _overflow = true;
    return copyLen;
  }

  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}

  size_t size() const { return _size; }
  bool overflowed() const { return _overflow; }

private:
  uint8_t* _buffer;
  size_t _capacity;
  size_t _size;
  bool _overflow;
};

// Percent-encode text for a URL query parameter.
// Only letters, digits, and -_.~ are left unencoded (RFC 3986 unreserved chars).
static String urlEncode(const String& text) {
  String out;
  out.reserve(text.length() * 3);
  for (unsigned int i = 0; i < text.length(); i++) {
    char c = text[i];
    if (isAlphaNumeric(c) || c == '-' || c == '_' || c == '.' || c == '~') {
      out += c;
    } else {
      char buf[4];
      snprintf(buf, sizeof(buf), "%%%02X", (uint8_t)c);
      out += buf;
    }
  }
  return out;
}

// Build a TTS URL for any text. Used when the server returns a text-only response
// (e.g. "I didn't catch that") without a pre-built audio_url.
String KiyannaCloud::ttsUrlForText(const String& text) {
  return String(API_BASE_URL) + "/api/device/tts?text=" + urlEncode(text);
}

ChatResult KiyannaCloud::chat(const String& token, const String& audioBase64, const String& language,
                              const String& pendingConfirmation) {
  ChatResult result = {false, false, false, "", "", "", "", ""};

  if (WiFi.status() != WL_CONNECTED) {
    result.error = "WiFi not connected";
    return result;
  }

  HTTPClient http;
  String url = String(API_BASE_URL) + CHAT_ENDPOINT;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + token);
  http.setTimeout(30000);  // 30s — Groq STT + Claude can take ~10s total

  // Build JSON in PSRAM — audio base64 can be 80KB+
  size_t jsonSize = audioBase64.length() + pendingConfirmation.length() + 192;
  char* jsonBuf = (char*)ps_malloc(jsonSize);
  if (!jsonBuf) jsonBuf = (char*)malloc(jsonSize);
  if (!jsonBuf) {
    result.error = "JSON alloc failed";
    return result;
  }
  snprintf(jsonBuf, jsonSize,
      "{\"device_id\":\"%s\",\"audio_base64\":\"%s\",\"language\":\"%s\",\"pending_confirmation\":\"%s\"}",
      DEVICE_ID, audioBase64.c_str(), language.c_str(), pendingConfirmation.c_str());

  if (DEBUG_MODE) {
    Serial.println("[CHAT] POST " + url);
    Serial.printf("[CHAT] Audio payload: %u chars\n", (unsigned)audioBase64.length());
  }

  int httpCode = http.POST((uint8_t*)jsonBuf, strlen(jsonBuf));
  free(jsonBuf);
  String payload = http.getString();
  http.end();

  if (DEBUG_MODE) Serial.printf("[CHAT] HTTP %d\n", httpCode);

  if (httpCode == 200) {
    JsonDocument resp;
    DeserializationError err = deserializeJson(resp, payload);
    if (err) {
      result.error = "JSON parse error";
      return result;
    }
    result.success  = true;
    result.text     = resp["text"].as<String>();
    result.audioUrl = resp["audio_url"] | "";
    result.language = resp["language"] | "en";
    result.pendingConfirmation = resp["pending_confirmation"] | "";

    if (DEBUG_MODE && !result.text.isEmpty()) {
      Serial.printf("[CHAT] Reply: %.80s\n", result.text.c_str());
      Serial.printf("[CHAT] audio_url: %s\n",
          result.audioUrl.isEmpty() ? "(none)" : result.audioUrl.c_str());
    }

  } else if (httpCode == 402) {
    result.lapsed = true;
    result.error  = "Subscription expired";

  } else if (httpCode == 401) {
    result.error = "Token expired";

  } else if (httpCode == 422) {
    // Legacy server returned 422 for empty transcription.
    // New server (ai-hardware) returns 200 with text "I didn't catch that" instead.
    result.noSpeech = true;
    result.error    = "No speech detected";

  } else {
    result.error = "HTTP " + String(httpCode);
    if (DEBUG_MODE) Serial.printf("[CHAT] Error body: %.120s\n", payload.c_str());
  }

  return result;
}

bool KiyannaCloud::logConversation(const String& token, const ConvLog& log) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(API_BASE_URL) + CONV_ENDPOINT;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + token);

  JsonDocument doc;
  doc["device_id"]     = DEVICE_ID;
  doc["session_id"]    = log.sessionId;
  doc["language"]      = log.language;
  doc["duration_s"]    = log.durationS;
  doc["message_count"] = log.messageCount;

  String body;
  serializeJson(doc, body);
  int httpCode = http.POST(body);
  http.end();

  return httpCode == 200;
}

size_t KiyannaCloud::downloadAudio(const String& url, uint8_t* buffer,
                                    size_t maxSize, const String& token) {
  if (WiFi.status() != WL_CONNECTED) return 0;

  HTTPClient http;
  http.begin(url);
  http.addHeader("Authorization", "Bearer " + token);
  http.setTimeout(30000);

  int httpCode = http.GET();
  Serial.printf("[TTS] HTTP %d  url_len=%u\n", httpCode, (unsigned)url.length());

  if (httpCode != 200) {
    if (DEBUG_MODE) {
      String errBody = http.getString();
      Serial.printf("[TTS] Error: %.120s\n", errBody.c_str());
    }
    http.end();
    return 0;
  }

  int contentLen = http.getSize();
  Serial.printf("[TTS] Content-Length: %d\n", contentLen);

  FixedBufferStream output(buffer, maxSize);
  int writeResult = http.writeToStream(&output);
  size_t total = output.size();

  if (writeResult < 0 && !output.overflowed()) {
    Serial.printf("[TTS] Body read failed: %s (%d)\n",
                  http.errorToString(writeResult).c_str(), writeResult);
  }
  if (output.overflowed()) {
    Serial.printf("[TTS] Audio exceeded %u-byte buffer — playing truncated response\n",
                  (unsigned)maxSize);
  }

  http.end();
  Serial.printf("[TTS] Downloaded %u bytes\n", (unsigned)total);
  return total;
}
