#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <Adafruit_Fingerprint.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);
const uint8_t lcdColumns = 16;
const uint8_t lcdI2cAddressCandidates[] = {0x27, 0x3F, 0x20, 0x38};
const uint32_t lcdScrollIntervalMs = 250;
const uint32_t enrollmentScanTimeoutMs = 30000;
const uint32_t fingerReleaseTimeoutMs = 10000;
const uint32_t wifiConnectTimeoutMs = 30000;
String standbyLine1 = "TEMPEL UTK ABSEN";
String standbyLine2 = "TKN 1 UTK DAFTAR";
String decisionLine1 = "DAFTAR TKN 1";
String decisionLine2 = "BATAL TKN 2";
String enrollmentDoneLine2 = "HUBUNGI @ABSENSI_SCAN_BOT";
uint32_t lastLcdScrollAt = 0;
uint16_t lcdScrollOffset = 0;

// Sesuaikan dengan Wi‑Fi yang aktif dan server lokal yang sedang berjalan.
// Pastikan jaringan yang dipakai adalah 2.4 GHz agar ESP32 bisa terhubung stabil.
const char* ssid = "SHINN";
const char* password = "shinraiden";
const char* attendanceApiUrl = "http://192.168.137.235:3000/api/attendance";
const char* deviceKey = "rahasia123";
const char* deviceId = "ESP32-01";
const char* employeeId = "";

WebServer server(3000);
HardwareSerial fingerprintSerial(2);
Adafruit_Fingerprint fingerprint = Adafruit_Fingerprint(&fingerprintSerial);

const int fingerprintRxPin = 32;
const int fingerprintTxPin = 33;
const int enrollButtonPin = 19;
const int cancelButtonPin = 23;
const int buzzerPin = 26;
const uint32_t fingerprintBaudRate = 57600;

int lastEnrollButtonState = LOW;
int lastCancelButtonState = LOW;
bool continuousScanMode = false;
bool enrollmentActive = false;
bool cancelRequested = false;
bool fingerprintSensorReady = false;
bool enrollmentConfirmationPending = false;
bool deleteSelectionPending = false;
bool enrollmentDecisionPending = false;
bool enrollmentCompletePending = false;
uint32_t enrollmentCompleteUntil = 0;
uint8_t pendingEnrollmentId = 0;
uint32_t lastStandbyPageAt = 0;
bool showingEnrollmentHint = false;
static bool standbyScreenVisible = false;
static bool decisionScreenVisible = false;
static bool completeScreenVisible = false;
bool lcdReady = false;
bool wifiBootStatusShown = false;
uint32_t lastWifiRetryAt = 0;

void sendScanResult();
void enrollFromButton();
void scanContinuously();
void initLcdWithFallback();
void beep(uint16_t frequency, uint16_t durationMs);
void playSuccessSound();
void playErrorSound();
uint8_t findFreeFingerprintId();
bool waitForFingerImage(uint32_t timeoutMs);
void showMessage(const char* line1, const char* line2);
void updateStandbyScreen();
void updateStandbyPage();
bool cancelPressed();
void sendDeviceCheckin(uint8_t templateId);
void sendDeviceEnroll(uint8_t templateId);
void showAttendanceStandby();
void showEnrollmentConfirmation();
void showAttendanceSuccess(uint8_t templateId);
void showScrollingStandby();
void showScrollingDecision();
void showTimedMessage(const String& text, uint32_t durationMs);
String getEmployeeName(const String& response);
void showEnrollmentComplete();
bool ensureWiFiConnected();
void deleteAllFingerprintsFromSensor();
void discardPendingEnrollmentTemplate();
bool connectToWiFi(uint32_t timeoutMs = wifiConnectTimeoutMs) {
  if (WiFi.status() == WL_CONNECTED) {
    lastWifiRetryAt = millis();
    return true;
  }

  WiFi.disconnect(true);
  delay(200);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.setHostname("ESP32-ABSENSI-01");
  WiFi.begin(ssid, password);

  uint32_t startedAt = millis();
  Serial.print("Mencoba connect ke WiFi: ");
  Serial.println(ssid);

  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < timeoutMs) {
    delay(250);
    Serial.print(".");
    if (lcdReady) {
      showMessage("MENGHUBUNGKAN", "WI-FI...");
    }
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    if (lcdReady) {
      showMessage("WI-FI", "TERHUBUNG");
      delay(800);
    }
    lastWifiRetryAt = millis();
    return true;
  }

  Serial.print("WiFi failed. Last status:");
  Serial.println(WiFi.status());
  if (lcdReady) {
    showMessage("WI-FI", "GAGAL");
    delay(800);
  }
  WiFi.disconnect(false);
  lastWifiRetryAt = millis();
  return false;
}

void stayInEnrollmentMode(const char* title, const char* subtitle) {
  enrollmentActive = true;
  enrollmentConfirmationPending = false;
  enrollmentDecisionPending = false;
  cancelRequested = false;
  continuousScanMode = false;
  lastEnrollButtonState = HIGH;
  lastCancelButtonState = HIGH;
  showMessage(title, subtitle);
  delay(1200);
  showMessage("MODE DAFTAR", "BATAL = TOMBOL 2");
}

void initLcdWithFallback() {
  lcdReady = false;
  Wire.begin();

  for (uint8_t i = 0; i < sizeof(lcdI2cAddressCandidates); i++) {
    uint8_t candidate = lcdI2cAddressCandidates[i];
    Wire.beginTransmission(candidate);
    uint8_t error = Wire.endTransmission();

    if (error == 0) {
      lcd = LiquidCrystal_I2C(candidate, 16, 2);
      lcd.init();
      lcd.clear();
      lcd.backlight();
      lcdReady = true;
      Serial.print("LCD I2C detected at 0x");
      Serial.println(candidate, HEX);
      return;
    }

    Serial.print("LCD address 0x");
    Serial.print(candidate, HEX);
    Serial.println(" not found");
  }

  lcdReady = false;
  Serial.println("LCD I2C tidak terdeteksi, tetap lanjut tanpa LCD");
}

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32 booting...");

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  initLcdWithFallback();
  showMessage("MEMULAI SISTEM", "TUNGGU...");

  pinMode(enrollButtonPin, INPUT_PULLDOWN);
  pinMode(cancelButtonPin, INPUT_PULLUP);
  pinMode(buzzerPin, OUTPUT);
  noTone(buzzerPin);

  updateStandbyScreen();

  fingerprintSerial.begin(fingerprintBaudRate, SERIAL_8N1, fingerprintRxPin, fingerprintTxPin);
  fingerprint.begin(fingerprintBaudRate);
  if (!fingerprint.verifyPassword()) {
    showMessage("SENSOR FP", "GAGAL / CEK KABEL");
  } else {
    fingerprintSensorReady = true;
    showMessage("SENSOR FP", "SIAP");
  }

  connectToWiFi(8000);

  if (!fingerprintSensorReady) {
    showMessage("SENSOR FP", "GAGAL / CEK KABEL");
  }

  server.on("/", HTTP_GET, []() {
    server.send(200, "text/plain", "OK");
  });

  server.on("/api/status", HTTP_GET, []() {
    String json = "{\"status\":\"online\",\"ip\":\"";
    json += WiFi.localIP().toString();
    json += "\",\"port\":3000}";
    server.send(200, "application/json", json);
  });

  server.on("/api/delete", HTTP_POST, []() {
    if (server.header("x-device-key") != deviceKey) {
      server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
      return;
    }
    int templateId = server.arg("templateId").toInt();
    if (templateId < 1 || templateId > 127) {
      server.send(400, "application/json", "{\"error\":\"Template ID invalid\"}");
      return;
    }
    if (fingerprint.deleteModel(templateId) == FINGERPRINT_OK) {
      server.send(200, "application/json", "{\"success\":true}");
    } else {
      server.send(502, "application/json", "{\"error\":\"Sensor gagal menghapus template\"}");
    }
  });

  server.on("/api/fingerprint/list", HTTP_GET, []() {
    if (server.header("x-device-key") != deviceKey) {
      server.send(401, "application/json", "{\"success\":false,\"error\":\"Unauthorized\"}");
      return;
    }
    if (!fingerprintSensorReady) {
      server.send(503, "application/json", "{\"success\":false,\"error\":\"Sensor fingerprint tidak siap\"}");
      return;
    }

    String response = "{\"success\":true,\"ids\":[";
    bool first = true;
    for (uint8_t id = 1; id <= 127; id++) {
      if (fingerprint.loadModel(id) == FINGERPRINT_OK) {
        if (!first) response += ",";
        response += String(id);
        first = false;
      }
    }
    response += "]}";
    server.send(200, "application/json", response);
  });

  const char* headerKeys[] = {"x-device-key"};
  server.collectHeaders(headerKeys, 1);
  server.begin();
  lastEnrollButtonState = digitalRead(enrollButtonPin);
  lastCancelButtonState = digitalRead(cancelButtonPin);
  continuousScanMode = true;
  showAttendanceStandby();
}

void loop() {
  if (Serial.available() > 0) {
    char command = Serial.read();
    if (command == 'o' || command == 'O') {
      deleteAllFingerprintsFromSensor();
    }
  }

  if (WiFi.status() != WL_CONNECTED && (millis() - lastWifiRetryAt > 1000 || lastWifiRetryAt == 0)) {
    connectToWiFi(10000);
  }

  server.handleClient();

  if (continuousScanMode && !enrollmentActive && !enrollmentConfirmationPending && !enrollmentDecisionPending) {
    if (!standbyScreenVisible) {
      showAttendanceStandby();
      standbyScreenVisible = true;
    }
    decisionScreenVisible = false;
    completeScreenVisible = false;
  } else {
    standbyScreenVisible = false;
  }

  if (enrollmentDecisionPending) {
    if (!decisionScreenVisible) {
      showScrollingDecision();
      decisionScreenVisible = true;
    }
    standbyScreenVisible = false;
    completeScreenVisible = false;
  } else {
    decisionScreenVisible = false;
  }

  if (enrollmentCompletePending) {
    if (millis() >= enrollmentCompleteUntil) {
      enrollmentCompletePending = false;
      pendingEnrollmentId = 0;
      enrollmentConfirmationPending = false;
      continuousScanMode = true;
      showAttendanceStandby();
      standbyScreenVisible = true;
      decisionScreenVisible = false;
      completeScreenVisible = false;
    } else {
      if (!completeScreenVisible) {
        showEnrollmentComplete();
        completeScreenVisible = true;
      }
      standbyScreenVisible = false;
      decisionScreenVisible = false;
    }
  } else {
    completeScreenVisible = false;
  }

  int enrollButtonState = digitalRead(enrollButtonPin);
  int cancelButtonState = digitalRead(cancelButtonPin);

  if (enrollButtonState == HIGH && lastEnrollButtonState == LOW) {
    delay(50);
    if (digitalRead(enrollButtonPin) == HIGH) {
      beep(880, 120);
      if (enrollmentDecisionPending) {
        enrollmentDecisionPending = false;
        sendDeviceEnroll(pendingEnrollmentId);
        enrollmentActive = false;
        enrollmentCompletePending = true;
        enrollmentCompleteUntil = millis() + 120000;
        continuousScanMode = false;
        lcdScrollOffset = 0;
        lastLcdScrollAt = 0;
        lastEnrollButtonState = HIGH;
        lastCancelButtonState = HIGH;
        showEnrollmentComplete();
      } else if (enrollmentCompletePending) {
        enrollmentCompletePending = false;
        pendingEnrollmentId = 0;
        completeScreenVisible = false;
        enrollmentConfirmationPending = true;
        continuousScanMode = false;
        showEnrollmentConfirmation();
      } else if (enrollmentConfirmationPending) {
        enrollmentConfirmationPending = false;
        enrollFromButton();
      } else if (!enrollmentActive && !enrollmentDecisionPending && !enrollmentCompletePending) {
        enrollmentConfirmationPending = true;
        continuousScanMode = false;
        showEnrollmentConfirmation();
      }
    }
  }

  if (enrollmentActive && !enrollmentDecisionPending && !enrollmentConfirmationPending && digitalRead(enrollButtonPin) == LOW && digitalRead(cancelButtonPin) == HIGH) {
    lastEnrollButtonState = LOW;
    lastCancelButtonState = HIGH;
  }

  bool cancelPressedEvent = (cancelButtonState == LOW) && (lastCancelButtonState == HIGH);
  if (cancelPressedEvent) {
    beep(660, 120);
    if (enrollmentCompletePending) {
      enrollmentCompletePending = false;
      pendingEnrollmentId = 0;
      completeScreenVisible = false;
      enrollmentConfirmationPending = false;
      enrollmentActive = false;
      cancelRequested = false;
      continuousScanMode = true;
      showAttendanceStandby();
    } else if (enrollmentDecisionPending) {
      discardPendingEnrollmentTemplate();
      enrollmentDecisionPending = false;
      enrollmentActive = false;
      continuousScanMode = true;
      showMessage("Pendaftaran", "dibatalkan");
      delay(1200);
      showAttendanceStandby();
    } else if (enrollmentActive) {
      discardPendingEnrollmentTemplate();
      cancelRequested = true;
      enrollmentActive = false;
      enrollmentConfirmationPending = false;
      enrollmentDecisionPending = false;
      continuousScanMode = true;
      pendingEnrollmentId = 0;
      showMessage("MODE ABSEN", "AKTIF");
      delay(800);
      showAttendanceStandby();
    } else if (enrollmentConfirmationPending) {
      enrollmentConfirmationPending = false;
      continuousScanMode = true;
      showAttendanceStandby();
    } else if (continuousScanMode) {
      showMessage("MODE ABSEN", "AKTIF");
      delay(800);
      showAttendanceStandby();
    }
  }

  if (continuousScanMode) scanContinuously();
  lastEnrollButtonState = enrollButtonState;
  lastCancelButtonState = cancelButtonState;
  delay(50);
}

void beep(uint16_t frequency, uint16_t durationMs) {
  tone(buzzerPin, frequency, durationMs);
  delay(durationMs);
  noTone(buzzerPin);
}

void deleteAllFingerprintsFromSensor() {
  if (!fingerprintSensorReady) {
    Serial.println("DELETE_ALL_GAGAL:SENSOR_TIDAK_SIAP");
    return;
  }

  Serial.println("DELETE_ALL_MULAI");
  uint16_t deletedCount = 0;
  for (uint8_t id = 1; id <= 127; id++) {
    if (fingerprint.deleteModel(id) == FINGERPRINT_OK) {
      deletedCount++;
      Serial.print("DELETE_OK:");
      Serial.println(id);
    }
    delay(30);
  }
  Serial.print("DELETE_ALL_SELESAI:");
  Serial.println(deletedCount);
}

void discardPendingEnrollmentTemplate() {
  if (pendingEnrollmentId == 0) return;

  if (fingerprint.deleteModel(pendingEnrollmentId) == FINGERPRINT_OK) {
    Serial.print("ENROLL_TEMPLATE_DISCARDED:");
    Serial.println(pendingEnrollmentId);
  } else {
    Serial.print("ENROLL_TEMPLATE_DISCARD_FAILED:");
    Serial.println(pendingEnrollmentId);
  }
  pendingEnrollmentId = 0;
}

void showMessage(const char* line1, const char* line2) {
  if (!lcdReady) return;
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
}

void showAttendanceStandby() {
  lcdScrollOffset = 0;
  lastLcdScrollAt = 0;
  showScrollingStandby();
}

void showEnrollmentConfirmation() {
  showMessage(decisionLine1.c_str(), decisionLine2.c_str());
}

void showAttendanceSuccess(uint8_t templateId) {
  char line[17];
  snprintf(line, sizeof(line), "ID: %u SCAN QR->", templateId);
  showMessage(line, "TKN 1 SELESAI");
}

void showScrollingLine(const String& text, uint16_t offset, uint8_t row) {
  String padded = text + "                ";
  uint16_t start = offset % padded.length();
  String frame = padded.substring(start, start + lcdColumns);
  if (frame.length() < lcdColumns) frame += padded.substring(0, lcdColumns - frame.length());
  lcd.setCursor(0, row);
  lcd.print(frame);
}

void showScrollingStandby() {
  showMessage(standbyLine1.c_str(), standbyLine2.c_str());
}

void showScrollingDecision() {
  showMessage(decisionLine1.c_str(), decisionLine2.c_str());
}

void showEnrollmentComplete() {
  char idLine[17];
  snprintf(idLine, sizeof(idLine), "ID: %u SCAN QR->", pendingEnrollmentId);
  showMessage(idLine, "TKN 1 SELESAI");
}

void showTimedMessage(const String& text, uint32_t durationMs) {
  String shortText = text;
  if (shortText.length() > 15) {
    shortText = shortText.substring(0, 15);
  }
  showMessage(shortText.c_str(), "ABSENSI BERHASIL");
  delay(durationMs);
}

String getEmployeeName(const String& response) {
  String key = "\"nickname\":\"";
  int start = response.indexOf(key);
  if (start < 0) {
    key = "\"employeeName\":\"";
    start = response.indexOf(key);
  }
  if (start < 0) return "pegawai";
  start += key.length();
  int end = response.indexOf('"', start);
  if (end < 0) return "pegawai";
  String name = response.substring(start, end);
  name.replace("\\\"", "\"");
  return name;
}

String getResponseField(const String& response, const String& field, const String& fallback) {
  String key = "\"" + field + "\":\"";
  int start = response.indexOf(key);
  if (start < 0) return fallback;
  start += key.length();
  int end = response.indexOf('"', start);
  if (end < 0) return fallback;
  return response.substring(start, end);
}

bool ensureWiFiConnected() {
  if (WiFi.status() == WL_CONNECTED) return true;

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(ssid, password);

  uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 8000) {
    delay(200);
  }

  if (WiFi.status() == WL_CONNECTED) {
    lastWifiRetryAt = millis();
    return true;
  }

  Serial.println("WiFi connect failed on demand");
  return false;
}

void sendDeviceCheckin(uint8_t templateId) {
  if (!ensureWiFiConnected()) {
    showMessage("ABSEN GAGAL", "WI-FI OFFLINE");
    return;
  }

  HTTPClient client;
  client.begin(attendanceApiUrl);
  client.setTimeout(15000);
  client.addHeader("Content-Type", "application/json");
  client.addHeader("x-device-key", deviceKey);

  String payload = "{\"action\":\"deviceCheckin\",\"deviceId\":\"";
  payload += deviceId;
  payload += "\",\"templateId\":";
  payload += String(templateId);
  payload += ",\"employeeId\":\"";
  payload += employeeId;
  payload += "\"}";

  int responseCode = client.POST(payload);
  String response = responseCode > 0 ? client.getString() : "";
  Serial.print("deviceCheckin HTTP: ");
  Serial.println(responseCode);
  if (response.length() > 0) {
    Serial.print("deviceCheckin response: ");
    Serial.println(response);
  }
  if (responseCode >= 200 && responseCode < 300) {
    String nickname = getEmployeeName(response);
    String greeting = "HALO " + nickname;
    if (greeting.length() > lcdColumns) {
      greeting = greeting.substring(0, lcdColumns);
    }
    String attendanceTime = getResponseField(response, "attendanceTime", "00:00");
    String attendanceStatus = getResponseField(response, "attendanceStatus", "Hadir");
    String attendanceMessage = attendanceStatus == "Pulang" ? "KELUAR " : "MASUK ";
    attendanceMessage += attendanceTime;
    showMessage(greeting.c_str(), attendanceMessage.c_str());
    delay(2000);
    showAttendanceStandby();
  } else {
    if (responseCode <= 0) {
      showMessage("ABSEN GAGAL", "SERVER TIMEOUT");
    } else if (response.indexOf("not mapped") >= 0 || response.indexOf("not found") >= 0) {
      showMessage("ABSEN GAGAL", "ID BELUM MAP");
    } else if (responseCode == 401) {
      showMessage("ABSEN GAGAL", "KEY SALAH");
    } else if (responseCode == 400) {
      showMessage("ABSEN GAGAL", "JADWAL SALAH");
    } else {
      showMessage("ABSEN GAGAL", "HTTP ERROR");
    }
    delay(1500);
  }
  client.end();
}

void sendDeviceEnroll(uint8_t templateId) {
  if (!ensureWiFiConnected()) {
    showMessage("DAFTAR GAGAL", "WI-FI OFFLINE");
    return;
  }

  HTTPClient client;
  client.begin(attendanceApiUrl);
  client.addHeader("Content-Type", "application/json");
  client.addHeader("x-device-key", deviceKey);

  String payload = "{\"action\":\"deviceEnroll\",\"deviceId\":\"";
  payload += deviceId;
  payload += "\",\"templateId\":";
  payload += String(templateId);
  payload += ",\"employeeId\":\"";
  payload += employeeId;
  payload += "\"}";

  int responseCode = client.POST(payload);
  if (responseCode > 0) {
    if (responseCode >= 400) {
      showMessage("DAFTAR GAGAL", "SERVER MENOLAK");
    } else {
      showMessage("ID TERSIMPAN", "ISI DATA TELEGRAM");
    }
  } else {
    showMessage("DAFTAR GAGAL", "SERVER OFFLINE");
  }
  client.end();
}

void updateStandbyScreen() {
  showingEnrollmentHint = true;
  lastStandbyPageAt = millis();
  showAttendanceStandby();
}

void updateStandbyPage() {
  showingEnrollmentHint = !showingEnrollmentHint;
  lastStandbyPageAt = millis();
  if (showingEnrollmentHint) {
    showMessage("TEMPELKAN JARI", "TEKAN UNTUK DAFTAR");
  } else {
    showMessage("TEMPELKAN JARI", "UNTUK ABSEN");
  }
}

bool cancelPressed() {
  int cancelButtonState = digitalRead(cancelButtonPin);
  bool pressed = (cancelButtonState == LOW) && (lastCancelButtonState == HIGH);

  if (pressed) {
    discardPendingEnrollmentTemplate();
    cancelRequested = true;
    beep(660, 120);
    showMessage("PENDAFTARAN", "BATAL");
  } else if (cancelButtonState == HIGH) {
    cancelRequested = false;
  }

  lastCancelButtonState = cancelButtonState;
  return pressed;
}

void playSuccessSound() {
  beep(1047, 120);
  delay(60);
  beep(1319, 180);
}

void playErrorSound() {
  beep(220, 250);
  delay(80);
  beep(220, 250);
}

void showRetryMessage() {
  playErrorSound();
  showMessage("GAGAL", "COBA LAGI");
  delay(1200);
}

void clearFingerIfPresent() {
  while (fingerprint.getImage() == FINGERPRINT_OK) {
    delay(50);
  }
}

bool waitForFingerImage(uint32_t timeoutMs) {
  uint32_t startedAt = millis();
  while (millis() - startedAt < timeoutMs) {
    if (cancelPressed()) return false;
    uint8_t result = fingerprint.getImage();
    if (result == FINGERPRINT_OK) return true;
    if (result != FINGERPRINT_NOFINGER) return false;
    delay(50);
  }
  return false;
}

bool waitForFingerRelease(uint32_t timeoutMs) {
  uint32_t startedAt = millis();
  while (millis() - startedAt < timeoutMs) {
    if (fingerprint.getImage() == FINGERPRINT_NOFINGER) return true;
    if (cancelPressed()) return false;
    delay(50);
  }
  return false;
}

void scanContinuously() {
  static uint32_t lastScanAt = 0;
  if (millis() - lastScanAt < 350) return;
  lastScanAt = millis();

  if (!fingerprintSensorReady) return;

  uint8_t imageResult = fingerprint.getImage();
  if (imageResult != FINGERPRINT_OK) return;

  if (fingerprint.image2Tz() == FINGERPRINT_OK && fingerprint.fingerSearch() == FINGERPRINT_OK) {
    playSuccessSound();
    sendDeviceCheckin(fingerprint.fingerID);
  } else {
    showMessage("SIDIK JARI", "TIDAK ADA");
    playErrorSound();
  }

  while (fingerprint.getImage() == FINGERPRINT_OK) delay(50);
  updateStandbyScreen();
}

void sendScanResult() {
  if (!waitForFingerImage(10000) || fingerprint.image2Tz() != FINGERPRINT_OK || fingerprint.fingerSearch() != FINGERPRINT_OK) {
    playErrorSound();
    return;
  }

  playSuccessSound();
  sendDeviceCheckin(fingerprint.fingerID);
}

uint8_t findFreeFingerprintId() {
  for (uint8_t id = 1; id <= 127; id++) {
    if (fingerprint.loadModel(id) != FINGERPRINT_OK) return id;
  }
  return 0;
}

void enrollFromButton() {
  enrollmentActive = true;
  cancelRequested = false;
  continuousScanMode = false;
  lastCancelButtonState = digitalRead(cancelButtonPin);
  showMessage("MODE DAFTAR", "BATAL = TOMBOL 2");

  uint8_t id = findFreeFingerprintId();
  if (id == 0) {
    playErrorSound();
    showMessage("DAFTAR GAGAL", "SLOT PENUH");
    delay(1200);
    showMessage("MODE DAFTAR", "BATAL = TOMBOL 2");
    return;
  }

  pendingEnrollmentId = id;

  while (enrollmentActive && !cancelRequested) {
    showMessage("TEMPEL JARI", "PERTAMA");
    if (waitForFingerImage(enrollmentScanTimeoutMs) && !cancelRequested && fingerprint.image2Tz(1) == FINGERPRINT_OK) {
      if (fingerprint.fingerSearch() == FINGERPRINT_OK) {
        playErrorSound();
        showMessage("SUDAH", "TERDAFTAR");
        delay(1500);
        enrollmentActive = false;
        continuousScanMode = true;
        cancelRequested = false;
        clearFingerIfPresent();
        showAttendanceStandby();
        return;
      }
      break;
    }
    if (cancelRequested) {
      enrollmentActive = false;
      continuousScanMode = true;
      cancelRequested = false;
      showAttendanceStandby();
      return;
    }
    Serial.println("ENROLL_STAGE1_FAIL");
    clearFingerIfPresent();
    showRetryMessage();
  }

  if (!enrollmentActive || cancelRequested) {
    return;
  }

  while (enrollmentActive && !cancelRequested) {
    showMessage("ANGKAT JARI", "TUNGGU...");
    if (waitForFingerRelease(fingerReleaseTimeoutMs) && !cancelRequested) {
      break;
    }
    if (cancelRequested) {
      enrollmentActive = false;
      continuousScanMode = true;
      cancelRequested = false;
      showAttendanceStandby();
      return;
    }
    Serial.println("ENROLL_RELEASE_FAIL");
    clearFingerIfPresent();
    showRetryMessage();
    showMessage("TEMPEL JARI", "PERTAMA");
    if (waitForFingerImage(enrollmentScanTimeoutMs) && !cancelRequested && fingerprint.image2Tz(1) == FINGERPRINT_OK) {
      if (fingerprint.fingerSearch() == FINGERPRINT_OK) {
        playErrorSound();
        showMessage("SUDAH", "TERDAFTAR");
        delay(1500);
        enrollmentActive = false;
        continuousScanMode = true;
        cancelRequested = false;
        clearFingerIfPresent();
        showAttendanceStandby();
        return;
      }
      break;
    }
    if (cancelRequested) {
      enrollmentActive = false;
      continuousScanMode = true;
      cancelRequested = false;
      showAttendanceStandby();
      return;
    }
    Serial.println("ENROLL_STAGE1_RETRY");
    clearFingerIfPresent();
    showRetryMessage();
  }

  if (!enrollmentActive || cancelRequested) {
    return;
  }

  while (enrollmentActive && !cancelRequested) {
    showMessage("TEMPEL JARI", "KEDUA");
    if (waitForFingerImage(enrollmentScanTimeoutMs) && !cancelRequested && fingerprint.image2Tz(2) == FINGERPRINT_OK && fingerprint.createModel() == FINGERPRINT_OK && fingerprint.storeModel(id) == FINGERPRINT_OK) {
      break;
    }
    if (cancelRequested) {
      enrollmentActive = false;
      continuousScanMode = true;
      cancelRequested = false;
      showAttendanceStandby();
      return;
    }
    Serial.println("ENROLL_STAGE2_FAIL");
    clearFingerIfPresent();
    showRetryMessage();
  }

  if (!enrollmentActive || cancelRequested) {
    return;
  }

  showMessage("ANGKAT JARI", "LANJUT");
  if (cancelRequested) {
    enrollmentActive = false;
    continuousScanMode = true;
    cancelRequested = false;
    showAttendanceStandby();
    return;
  }
  if (!waitForFingerRelease(fingerReleaseTimeoutMs) || cancelRequested) {
    if (cancelRequested) {
      enrollmentActive = false;
      continuousScanMode = true;
      cancelRequested = false;
      showAttendanceStandby();
      return;
    }
    Serial.println("ENROLL_STAGE2_RELEASE_FAIL");
    clearFingerIfPresent();
    showRetryMessage();
    return;
  }

  for (int verification = 1; verification <= 3 && enrollmentActive && !cancelRequested; ) {
    clearFingerIfPresent();
    char verificationLine[17];
    snprintf(verificationLine, sizeof(verificationLine), "VERIFY %D/3", verification);
    showMessage(verificationLine, "TEMPEL JARI");
    for (int beepCount = 0; beepCount < verification; beepCount++) beep(740, 140);

    if (cancelRequested) {
      enrollmentActive = false;
      continuousScanMode = true;
      cancelRequested = false;
      showAttendanceStandby();
      return;
    }
    if (!waitForFingerImage(enrollmentScanTimeoutMs) || cancelRequested || fingerprint.image2Tz() != FINGERPRINT_OK || fingerprint.fingerSearch() != FINGERPRINT_OK || fingerprint.fingerID != id) {
      if (cancelRequested) {
        enrollmentActive = false;
        continuousScanMode = true;
        cancelRequested = false;
        showAttendanceStandby();
        return;
      }
      Serial.print("ENROLL_VERIFY_FAIL:");
      Serial.println(verification);
      clearFingerIfPresent();
      showRetryMessage();
      continue;
    }

    beep(980, 100);
    if (verification < 3) {
      showMessage("ANGKAT JARI", "LANJUT");
      if (cancelRequested) {
        enrollmentActive = false;
        continuousScanMode = true;
        cancelRequested = false;
        showAttendanceStandby();
        return;
      }
      if (!waitForFingerRelease(fingerReleaseTimeoutMs) || cancelRequested) {
        if (cancelRequested) {
          enrollmentActive = false;
          continuousScanMode = true;
          cancelRequested = false;
          showAttendanceStandby();
          return;
        }
        Serial.print("ENROLL_VERIFY_RELEASE_FAIL:");
        Serial.println(verification);
        clearFingerIfPresent();
        showRetryMessage();
        continue;
      }
      showMessage("ANGKAT JARI", "LANJUT");
      delay(300);
    }
    verification++;
  }

  if (!enrollmentActive || cancelRequested) {
    return;
  }

  playSuccessSound();
  pendingEnrollmentId = id;
  enrollmentDecisionPending = true;
  continuousScanMode = false;
  lcdScrollOffset = 0;
  lastLcdScrollAt = 0;
  showScrollingDecision();
}