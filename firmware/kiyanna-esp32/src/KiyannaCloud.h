#pragma once
#include <Arduino.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h"

struct ChatResult {
  bool success;
  bool lapsed;
  String text;       // Claude's text response
  String audioUrl;   // TTS audio URL if provided by server
  String language;   // detected language
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
  ChatResult chat(const String& token, const String& audioBase64, const String& language = "auto");

  // Log conversation to dashboard
  bool logConversation(const String& token, const ConvLog& log);

  // Download TTS audio to buffer (returns size)
  size_t downloadAudio(const String& url, uint8_t* buffer, size_t maxSize);
};
