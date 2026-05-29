#include "KiyannaCloud.h"

KiyannaCloud::KiyannaCloud() {}

ChatResult KiyannaCloud::chat(const String& token, const String& audioBase64, const String& language) {
  ChatResult result = {false, false, "", "", "", ""};

  if (WiFi.status() != WL_CONNECTED) {
    result.error = "WiFi not connected";
    return result;
  }

  HTTPClient http;
  String url = String(API_BASE_URL) + CHAT_ENDPOINT;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + token);
  http.setTimeout(30000);  // 30s for Claude response

  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["audio_base64"] = audioBase64;
  doc["language"] = language;

  String body;
  serializeJson(doc, body);

  if (DEBUG_MODE) {
    Serial.println("[CHAT] POST " + url);
    Serial.println("[CHAT] Audio size: " + String(audioBase64.length()) + " chars");
  }

  int httpCode = http.POST(body);
  String payload = http.getString();
  http.end();

  if (DEBUG_MODE) {
    Serial.print("[CHAT] Response: ");
    Serial.println(httpCode);
  }

  if (httpCode == 200) {
    JsonDocument resp;
    DeserializationError err = deserializeJson(resp, payload);
    if (!err) {
      result.success = true;
      result.text = resp["text"].as<String>();
      result.audioUrl = resp["audio_url"] | "";
      result.language = resp["language"] | "en";
    } else {
      result.error = "JSON parse error";
    }
  } else if (httpCode == 402) {
    result.lapsed = true;
    result.error = "Subscription expired";
  } else if (httpCode == 401) {
    result.error = "Token expired — re-authenticating";
  } else {
    result.error = "HTTP " + String(httpCode);
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
  doc["device_id"] = DEVICE_ID;
  doc["session_id"] = log.sessionId;
  doc["language"] = log.language;
  doc["duration_s"] = log.durationS;
  doc["message_count"] = log.messageCount;

  String body;
  serializeJson(doc, body);
  int httpCode = http.POST(body);
  http.end();

  return httpCode == 200;
}

size_t KiyannaCloud::downloadAudio(const String& url, uint8_t* buffer, size_t maxSize) {
  HTTPClient http;
  http.begin(url);
  int httpCode = http.GET();

  if (httpCode == 200) {
    WiFiClient* stream = http.getStreamPtr();
    size_t total = 0;
    uint8_t buf[512];
    size_t n;
    while ((n = stream->readBytes(buf, sizeof(buf))) > 0 && total + n <= maxSize) {
      memcpy(buffer + total, buf, n);
      total += n;
    }
    http.end();
    return total;
  }
  http.end();
  return 0;
}
