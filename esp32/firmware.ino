// ESP32 Firmware - SUIVI-DECHETS Industrial IoT
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Ultrasonic.h>

#define TRIG_PIN 5
#define ECHO_PIN 18
#define TEMP_PIN 34
#define BATTERY_PIN 35

const char* ssid = "VOTRE_WIFI";
const char* password = "VOTRE_MDP";
const char* serverUrl = "http://VOTRE_SERVEUR:3000/api/iot/releve";
const char* esp32Token = "shared-secret-key-2026";
String esp32Id;

Ultrasonic ultrasonic(TRIG_PIN, ECHO_PIN);

unsigned long lastSend = 0;
unsigned long sendInterval = 60000; // 60s

float getDistanceCm() {
  return ultrasonic.read();
}

float getTemperatureC() {
  int raw = analogRead(TEMP_PIN);
  return (raw / 4095.0f) * 100.0f;
}

int getBatteryLevel() {
  int raw = analogRead(BATTERY_PIN);
  int pct = map(raw, 0, 4095, 0, 100);
  return constrain(pct, 0, 100);
}

void sendData() {
  if (WiFi.status() != WL_CONNECTED) return;

  float distance = getDistanceCm();
  float temperature = getTemperatureC();
  int battery = getBatteryLevel();
  int signal = WiFi.RSSI();

  int maxDistance = 200; // cm
  int niveau = constrain(map((int)distance, 0, maxDistance, 100, 0), 0, 100);

  StaticJsonDocument<256> doc;
  doc["esp32_id"] = esp32Id;
  doc["niveau"] = niveau;
  doc["temperature"] = temperature;
  doc["batterie"] = battery;
  doc["signal"] = signal;
  doc["distance"] = distance;
  doc["poids"] = distance > 0 ? (200.0f - distance) * 0.08f : 0.0f;

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-esp32-token", esp32Token);
  int code = http.POST(payload);

  if (code > 0) {
    String body = http.getString();
    Serial.printf("POST /api/iot/releve => %d %s\n", code, body.c_str());
  } else {
    Serial.printf("HTTP error: %s\n", http.errorToString(code).c_str());
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(300);

  esp32Id = WiFi.macAddress();
  WiFi.begin(ssid, password);
  Serial.print("Connexion WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connecté");
  Serial.print("ESP32 ID: ");
  Serial.println(esp32Id);
}

void loop() {
  if (millis() - lastSend >= sendInterval) {
    sendData();
    lastSend = millis();
  }
  delay(1000);
}
