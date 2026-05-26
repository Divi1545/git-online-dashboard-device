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
  http.addHeader("Content-Type", "application/json");
  http.addHeader("User-Agent", "Kiyanna-ESP32/1.0");
  // CORS — device POSTs directly to Vercel API

  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["secret"] = DEVICE_SECRET;
  String body;
  serializeJson(doc, body);

  if (DEBUG_MODE) Serial.println("[AUTH] POST " + url);

  int httpCode = http.POST(body);
  String payload = http.getString();
  http.end();

  if (DEBUG_MODE) {
    Serial.print("[AUTH] Response: ");
    Serial.print(httpCode);
    Serial.print(" ");
    Serial.println(payload);
  }

  if (httpCode == 200) {
    JsonDocument resp;
    DeserializationError err = deserializeJson(resp, payload);
    if (!err) {
      result.success = true;
      result.token = resp["token"].as<String>();
      result.expiresAt = resp["expires_at"] | 0;
      _token = result.token;
      _expiresAt = result.expiresAt;
      _lapsed = false;
    } else {
      result.error = "JSON parse error";
    }
  } else if (httpCode == 402) {
    result.lapsed = true;
    _lapsed = true;
    result.error = "Subscription expired";
  } else if (httpCode == 401) {
    result.error = "Invalid device credentials";
  } else if (httpCode < 0) {
    result.error = "HTTP error: " + String(httpCode);
  } else {
    result.error = "Server error: " + String(httpCode);
  }

  return result;
}

bool KiyannaAuth::heartbeat(const String& token) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(API_BASE_URL) + HB_ENDPOINT;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + token);

  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  String body;
  serializeJson(doc, body);

  int httpCode = http.POST(body);
  http.end();

  if (DEBUG_MODE) {
    Serial.print("[HB] ");
    Serial.println(httpCode);
  }

  if (httpCode == 402) {
    _lapsed = true;
    return false;
  }
  return httpCode == 200;
}

bool KiyannaAuth::isTokenValid() {
  if (_token.isEmpty()) return false;
  if (_expiresAt == 0) return true;  // no expiry info, assume valid
  long now = (long)(millis() / 1000) + 1700000000L;  // rough epoch
  return now < (_expiresAt - TOKEN_REFRESH_BUFFER);
}
