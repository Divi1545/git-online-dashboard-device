#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h"

struct ChatResult {
  bool success;
  bool lapsed;
  bool noSpeech;     // 422 from legacy server (new server returns 200 with text instead)
  String text;       // Claude's text response
  String audioUrl;   // TTS audio URL returned by server (may be empty)
  String language;   // detected/requested language
  String pendingConfirmation; // short-lived opaque cloud token; never contains credentials
  String error;
};

struct ConvLog {
  String sessionId;
  String language;
  int durationS;
  int messageCount;
};

class KiyannaCloud {
public:
  KiyannaCloud();

  // Send audio to cloud, get Claude response
  ChatResult chat(const String& token, const String& audioBase64, const String& language = "auto",
                  const String& pendingConfirmation = "");

  // Build a TTS URL for arbitrary text — use when server returns text-only response
  String ttsUrlForText(const String& text);

  // Log conversation to dashboard
  bool logConversation(const String& token, const ConvLog& log);

  // Download TTS audio (WAV) to buffer — passes JWT for server auth. Returns bytes written.
  size_t downloadAudio(const String& url, uint8_t* buffer, size_t maxSize, const String& token = "");
};
