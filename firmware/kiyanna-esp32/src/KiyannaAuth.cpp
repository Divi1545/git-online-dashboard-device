#include "KiyannaAuth.h"

KiyannaAuth::KiyannaAuth() : _expiresAt(0), _lapsed(false) {}

AuthResult KiyannaAuth::authenticate() {
  AuthResult result = {false, false, "", 0, ""};

  if (WiFi.status() != WL_CONNECTED) {
    result.error = "WiFi not connected";
    return result;
  }

  HTTPClient http;
  String url = String(API_BASE_URL) + AUTH_ENDPOINT;
  http.begin(url);
  http.setTimeout(12000);  // 12s — Vercel cold-start can take ~5-8s
  http.addHeader("Content-Type", "application/json");
  http.addHeader("User-Agent", "Kiyanna-ESP32/1.0");

  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["secret"]    = DEVICE_SECRET;
  String body;
  serializeJson(doc, body);

  if (DEBUG_MODE) Serial.println("[AUTH] POST " + url);

  int httpCode = http.POST(body);
  String payload = http.getString();
  http.end();

  if (DEBUG_MODE) {
    Serial.printf("[AUTH] HTTP %d\n", httpCode);
    if (!payload.isEmpty()) Serial.printf("[AUTH] Body: %.120s\n", payload.c_str());
  }

  if (httpCode == 200) {
    JsonDocument resp;
    DeserializationError err = deserializeJson(resp, payload);
    if (!err) {
      result.success   = true;
      result.token     = resp["token"].as<String>();
      result.expiresAt = resp["expires_at"] | 0;
      _token    = result.token;
      _expiresAt = result.expiresAt;
      _lapsed   = false;
    } else {
      result.error = "Bad response JSON";
    }

  } else if (httpCode == 402) {
    result.lapsed = true;
    _lapsed = true;
    result.error = "Subscription expired\nRenew at aicodeagency.org";

  } else if (httpCode == 404) {
    result.error = "Device not registered\nAdd KIYANNA-001\nto dashboard";

  } else if (httpCode == 401) {
    result.error = "Wrong device secret\nCheck config.h";

  } else if (httpCode == 429) {
    result.error = "Rate limited\nWait 1 minute";

  } else if (httpCode <= 0) {
    // Negative = TCP/TLS error: -1=connection refused, -11=timeout, etc.
    result.error = "Server unreachable\n" + String(API_BASE_URL);

  } else {
    result.error = "Auth error HTTP " + String(httpCode);
  }

  return result;
}

bool KiyannaAuth::heartbeat(const String& token) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(API_BASE_URL) + HB_ENDPOINT;
  http.begin(url);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + token);

  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  String body;
  serializeJson(doc, body);

  int httpCode = http.POST(body);
  http.end();

  if (DEBUG_MODE) Serial.printf("[HB] HTTP %d\n", httpCode);

  if (httpCode == 402) {
    _lapsed = true;
    return false;
  }
  return httpCode == 200;
}

bool KiyannaAuth::isTokenValid() {
  if (_token.isEmpty()) return false;
  if (_expiresAt == 0)  return true;
  long now = (long)(millis() / 1000) + 1700000000L;
  return now < (_expiresAt - TOKEN_REFRESH_BUFFER);
}
