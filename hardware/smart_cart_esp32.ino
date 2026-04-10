// Developed by Susmik
// Smart Cart System - RFID + Weight Verification
// Unauthorized reuse without credit is not allowed

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include "HX711.h"

// ---------------- WIFI / BACKEND ----------------
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* BACKEND_BASE = "http://IPV4_ADDRESS:3000";
const char* DEVICE_ID = "CART_001_DEV";
const char* DEVICE_SECRET = "cart001_secret_2026";
const char* CART_ID = "CART_001";

// ---------------- RFID ----------------
#define RFID_SS_PIN 5
#define RFID_RST_PIN 27
MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);

// ---------------- HX711 ----------------
#define HX_DT 4
#define HX_SCK 2
HX711 scale;

const float CALIBRATION_FACTOR = HX711_CALIBRATION_FACTOR;
const float NOISE_FLOOR_G = 5.0;
const float WEIGHT_SEND_DELTA_G = 5.0;
const unsigned long WEIGHT_SEND_INTERVAL_MS = 2500;

// ---------------- BUZZER ----------------
#define BUZZER_PIN 13

// ---------------- TIMING ----------------
String lastUid = "";
unsigned long lastScanAt = 0;
const unsigned long SCAN_COOLDOWN_MS = 1500;

float lastSentWeight = -9999.0;
unsigned long lastWeightSentAt = 0;

bool lastMismatch = false;
unsigned long lastMismatchBuzzAt = 0;

// ---------------- HELPERS ----------------
void buzz(int times, int onMs, int offMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(onMs);
    digitalWrite(BUZZER_PIN, LOW);
    if (i < times - 1) delay(offMs);
  }
}

void beepSuccess() {
  buzz(1, 80, 0);
}

void beepError() {
  buzz(2, 120, 100);
}

void beepMismatch() {
  buzz(1, 500, 0);
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi connected");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

String readUid() {
  String uid = "";

  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }

  uid.toUpperCase();
  return uid;
}

bool responseHasSuccess(const String& response) {
  return response.indexOf("\"success\":true") >= 0;
}

bool responseHasMismatch(const String& response) {
  return response.indexOf("\"status\":\"MISMATCH\"") >= 0 ||
         response.indexOf("\"weight_status\":\"MISMATCH\"") >= 0;
}

void postScan(const String& uid) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  HTTPClient http;
  String url = String(BACKEND_BASE) + "/device/scan";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-id", DEVICE_ID);
  http.addHeader("x-device-secret", DEVICE_SECRET);

  String payload = "{\"cart_id\":\"" + String(CART_ID) + "\",\"rfid\":\"" + uid + "\"}";

  int httpCode = http.POST(payload);
  String response = http.getString();

  Serial.println("---------- SCAN ----------");
  Serial.print("UID: ");
  Serial.println(uid);
  Serial.print("HTTP: ");
  Serial.println(httpCode);
  Serial.println(response);

  if (httpCode == 200 && responseHasSuccess(response)) {
    Serial.println("Scan success");
    beepSuccess();
  } else {
    Serial.println("Scan failed");
    beepError();
  }

  http.end();
}

float readWeightGrams() {
  if (!scale.is_ready()) {
    Serial.println("HX711 not ready");
    return NAN;
  }

  float weight = scale.get_units(10);

  if (abs(weight) < NOISE_FLOOR_G) {
    weight = 0.0;
  }

  weight = round(weight * 10.0) / 10.0;
  return weight;
}

void postWeight(float actualWeight) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  HTTPClient http;
  String url = String(BACKEND_BASE) + "/device/weight";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-id", DEVICE_ID);
  http.addHeader("x-device-secret", DEVICE_SECRET);

  String payload = "{\"cart_id\":\"" + String(CART_ID) + "\",\"actual_weight\":" + String(actualWeight, 1) + "}";

  int httpCode = http.POST(payload);
  String response = http.getString();

  Serial.println("---------- WEIGHT ----------");
  Serial.print("Actual Weight: ");
  Serial.print(actualWeight);
  Serial.println(" g");
  Serial.print("HTTP: ");
  Serial.println(httpCode);
  Serial.println(response);

  if (httpCode == 200 && responseHasSuccess(response)) {
    bool mismatch = responseHasMismatch(response);

    if (mismatch) {
      Serial.println("Weight mismatch detected");
      if (!lastMismatch || millis() - lastMismatchBuzzAt > 4000) {
        beepMismatch();
        lastMismatchBuzzAt = millis();
      }
    } else {
      if (lastMismatch) {
        Serial.println("Weight restored OK");
        beepSuccess();
      }
    }

    lastMismatch = mismatch;
  }

  http.end();
}

void setupRFID() {
  SPI.begin(18, 19, 23, 5);
  rfid.PCD_Init();
  Serial.println("RFID ready");
}

void setupWeight() {
  scale.begin(HX_DT, HX_SCK);
  scale.set_scale(CALIBRATION_FACTOR);

  Serial.println("Keep load cell empty. Taring...");
  delay(3000);
  scale.tare();
  Serial.println("Weight sensor ready");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  connectWiFi();
  setupRFID();
  setupWeight();

  Serial.println("System ready");
  Serial.println("Start session from browser, then scan tags.");
}

void loop() {
  // ---- RFID scan ----
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    String uid = readUid();
    unsigned long now = millis();

    if (uid == lastUid && (now - lastScanAt) < SCAN_COOLDOWN_MS) {
      Serial.println("Duplicate scan ignored: " + uid);
    } else {
      lastUid = uid;
      lastScanAt = now;
      postScan(uid);
    }

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    delay(300);
  }

  // ---- Weight update ----
  unsigned long now = millis();
  if (now - lastWeightSentAt >= WEIGHT_SEND_INTERVAL_MS) {
    float currentWeight = readWeightGrams();

    if (!isnan(currentWeight)) {
      if (abs(currentWeight - lastSentWeight) >= WEIGHT_SEND_DELTA_G ||
          lastSentWeight < -1000.0) {
        postWeight(currentWeight);
        lastSentWeight = currentWeight;
      } else {
        Serial.print("Weight stable: ");
        Serial.print(currentWeight);
        Serial.println(" g");
      }
    }

    lastWeightSentAt = now;
  }

  delay(50);
}