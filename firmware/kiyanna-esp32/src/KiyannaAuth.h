#pragma once
#include <Arduino.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h"

struct AuthResult {
  bool success;
  bool lapsed;      // true if 402 subscription expired
  String token;
  long expiresAt;   // unix timestamp
  String error;
};

class KiyannaAuth {
public:
  KiyannaAuth();
  AuthResult authenticate();
  bool heartbeat(const String& token);
  bool isTokenValid();
  String getToken() { return _token; }
  bool isLapsed() { return _lapsed; }

private:
  String _token;
  long _expiresAt;
  bool _lapsed;
};
