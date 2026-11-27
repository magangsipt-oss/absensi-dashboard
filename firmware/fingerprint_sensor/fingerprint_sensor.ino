#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Adafruit_Fingerprint.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Preferences.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);
const uint8_t lcdColumns = 16;
const uint8_t lcdI2cAddressCandidates[] = {0x27, 0x3F, 0x20, 0x38};
const uint32_t enrollmentScanTimeoutMs = 30000;
const uint32_t fingerReleaseTimeoutMs = 10000;
const uint32_t wifiConnectTimeoutMs = 30000;
const uint32_t attendanceResultDisplayMs = 1500;
const uint32_t deviceCommandPollIntervalMs = 5000;
const uint32_t templateSyncIntervalMs = 60000;
const uint32_t wifiRetryIntervalMs = 15000;
const uint32_t attendanceFingerReleaseTimeoutMs = 3000;
const uint32_t fingerprintRecoveryIntervalMs = 5000;
const uint32_t attendanceHttpsTimeoutMs = 5000;
const uint32_t attendanceHttpsHandshakeTimeoutSeconds = 5;
const uint32_t attendanceHttpsConnectTimeoutMs = 5000;
const uint32_t wifiOnDemandTimeoutMs = 3000;
String standbyLine1 = "TEMPEL UTK ABSEN";
String standbyLine2 = "TKN 1 UTK DAFTAR";
String decisionLine1 = "DAFTAR TKN 1";
String decisionLine2 = "BATAL TKN 2";
uint32_t lastLcdScrollAt = 0;
uint16_t lcdScrollOffset = 0;

// Sesuaikan dengan Wi-Fi yang aktif. ESP32 mengirim data ke API production Vercel.
// Pastikan jaringan yang dipakai adalah 2.4 GHz agar ESP32 bisa terhubung stabil.
const char* ssid = "WH Prapatan Atas_EXT";
const char* password = "tangguhoptima2026";
// Alamat lama (Vercel): https://absensi-online-delta.vercel.app/api/attendance
const char* attendanceApiUrl = "https://103-176-78-157.sslip.io/api/attendance";
// Harus sama dengan environment variable DEVICE_KEY di Vercel.
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
bool enrollmentDecisionPending = false;
bool enrollmentCompletePending = false;
uint32_t enrollmentCompleteUntil = 0;
uint8_t pendingEnrollmentId = 0;
static bool standbyScreenVisible = false;
static bool decisionScreenVisible = false;
static bool completeScreenVisible = false;
bool lcdReady = false;
uint32_t lastWifiRetryAt = 0;
bool attendanceRequestInProgress = false;
Preferences nicknameStore;
uint32_t lastDeviceCommandPollAt = 0;
uint32_t lastTemplateSyncAt = 0;
uint32_t lastFingerprintRecoveryAt = 0;

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
bool cancelPressed();
void sendDeviceCheckin(uint8_t templateId);
void sendDeviceEnroll(uint8_t templateId);
void showAttendanceStandby();
void showEnrollmentConfirmation();
void showScrollingStandby();
void showScrollingDecision();
String getEmployeeName(const String& response);
void showEnrollmentComplete();
bool ensureWiFiConnected();
void deleteAllFingerprintsFromSensor();
void discardPendingEnrollmentTemplate();
void pollDeviceCommands();
void syncNicknameCache();
bool syncSensorTemplatesToServer();
String getCachedNickname(uint8_t templateId);
void recoverFingerprintSensor();
bool connectToWiFi(uint32_t timeoutMs = wifiConnectTimeoutMs) {
  if (WiFi.status() == WL_CONNECTED) {
    lastWifiRetryAt = millis();
    return true;
  }

  WiFi.disconnect(false, false);
  delay(500);
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

  wl_status_t status = WiFi.status();
  Serial.print("WiFi gagal. Status code: ");
  Serial.println(static_cast<int>(status));
  if (status == WL_NO_SSID_AVAIL) {
    Serial.println("SSID tidak ditemukan. Pastikan 2.4 GHz aktif dan nama SSID tepat.");
  } else if (status == WL_CONNECT_FAILED) {
    Serial.println("Autentikasi gagal. Periksa password Wi-Fi.");
  } else if (status == WL_CONNECTION_LOST) {
    Serial.println("Koneksi terputus setelah tersambung.");
  } else {
    Serial.println("Gagal mendapatkan koneksi DHCP atau status Wi-Fi lain.");
  }

  int networkCount = WiFi.scanNetworks(false, true);
  Serial.print("SSID ditemukan: ");
  Serial.println(networkCount);
  bool targetFound = false;
  for (int index = 0; index < networkCount; index++) {
    if (WiFi.SSID(index) == ssid) {
      targetFound = true;
      Serial.print("Target SSID terlihat, RSSI: ");
      Serial.print(WiFi.RSSI(index));
      Serial.print(" dBm, channel: ");
      Serial.println(WiFi.channel(index));
    }
  }
  if (!targetFound) Serial.println("Target SSID tidak terlihat oleh ESP32.");
  WiFi.scanDelete();
  if (lcdReady) {
    showMessage("WI-FI", "GAGAL");
    delay(800);
  }
  WiFi.disconnect(false);
  lastWifiRetryAt = millis();
  return false;
}

void initLcdWithFallback() {
  lcdReady = false;
  Wire.begin();
  Wire.setClock(100000);

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

  connectToWiFi(wifiConnectTimeoutMs);
  nicknameStore.begin("fp_names", false);
  syncNicknameCache();

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

  server.on("/api/cache/delete", HTTP_POST, []() {
    if (server.header("x-device-key") != deviceKey) {
      server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
      return;
    }

    int templateId = server.arg("templateId").toInt();
    if (templateId < 1 || templateId > 127) {
      server.send(400, "application/json", "{\"error\":\"Template ID invalid\"}");
      return;
    }

    nicknameStore.remove((String("n") + String(templateId)).c_str());
    server.send(200, "application/json", "{\"success\":true}");
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

  if (WiFi.status() != WL_CONNECTED && (millis() - lastWifiRetryAt > wifiRetryIntervalMs || lastWifiRetryAt == 0)) {
    connectToWiFi(2000);
  }

  server.handleClient();

  if (!attendanceRequestInProgress && WiFi.status() == WL_CONNECTED && fingerprintSensorReady && millis() - lastDeviceCommandPollAt >= deviceCommandPollIntervalMs) {
    lastDeviceCommandPollAt = millis();
    pollDeviceCommands();
  }

  if (!attendanceRequestInProgress && WiFi.status() == WL_CONNECTED && fingerprintSensorReady &&
      (lastTemplateSyncAt == 0 || millis() - lastTemplateSyncAt >= templateSyncIntervalMs)) {
    lastTemplateSyncAt = millis();
    syncSensorTemplatesToServer();
  }

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
  static String previousLine1;
  static String previousLine2;

  if (!lcdReady) return;
  if (previousLine1 == line1 && previousLine2 == line2) return;

  previousLine1 = line1;
  previousLine2 = line2;
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

bool responseWasSkipped(const String& response) {
  return response.indexOf("\"skipped\":true") >= 0;
}

bool ensureWiFiConnected() {
  if (WiFi.status() == WL_CONNECTED) return true;

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(ssid, password);

  uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < wifiOnDemandTimeoutMs) {
    delay(200);
  }

  if (WiFi.status() == WL_CONNECTED) {
    lastWifiRetryAt = millis();
    return true;
  }

  Serial.println("WiFi connect failed on demand");
  return false;
}

String getCachedNickname(uint8_t templateId) {
  if (templateId < 1 || templateId > 127) return "";
  return nicknameStore.getString((String("n") + String(templateId)).c_str(), "");
}

void recoverFingerprintSensor() {
  if (lastFingerprintRecoveryAt != 0 && millis() - lastFingerprintRecoveryAt < fingerprintRecoveryIntervalMs) return;
  lastFingerprintRecoveryAt = millis();

  Serial.println("Mencoba memulihkan sensor fingerprint...");
  fingerprint.begin(fingerprintBaudRate);
  fingerprintSensorReady = fingerprint.verifyPassword();
  if (fingerprintSensorReady) {
    Serial.println("Sensor fingerprint siap kembali");
  } else {
    Serial.println("Sensor fingerprint belum merespons");
    showMessage("SENSOR FP", "CEK KABEL");
  }
}

void syncNicknameCache() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient client;
  WiFiClientSecure secureClient;
  secureClient.setInsecure();
  if (!client.begin(secureClient, attendanceApiUrl)) return;
  client.setTimeout(5000);
  client.addHeader("Content-Type", "application/json");
  client.addHeader("x-device-key", deviceKey);

  int responseCode = client.POST("{\"action\":\"deviceSync\"}");
  String response = responseCode > 0 ? client.getString() : "";
  client.end();
  if (responseCode < 200 || responseCode >= 300) return;

  nicknameStore.clear();
  int searchFrom = 0;
  while (true) {
    int idKey = response.indexOf("\"templateId\":", searchFrom);
    if (idKey < 0) break;
    int idStart = idKey + 13;
    int idEnd = response.indexOf(',', idStart);
    if (idEnd < 0) break;
    uint8_t templateId = static_cast<uint8_t>(response.substring(idStart, idEnd).toInt());

    int nameKey = response.indexOf("\"nickname\":\"", idEnd);
    if (nameKey < 0) break;
    int nameStart = nameKey + 12;
    int nameEnd = response.indexOf('"', nameStart);
    if (nameEnd < 0) break;
    if (templateId >= 1 && templateId <= 127) {
      nicknameStore.putString((String("n") + String(templateId)).c_str(), response.substring(nameStart, nameEnd));
    }
    searchFrom = nameEnd + 1;
  }
}

bool syncSensorTemplatesToServer() {
  if (WiFi.status() != WL_CONNECTED || !fingerprintSensorReady) return false;

  String templates = "[";
  bool firstTemplate = true;
  for (uint8_t templateId = 1; templateId <= 127; templateId++) {
    if (fingerprint.loadModel(templateId) != FINGERPRINT_OK) continue;
    if (!firstTemplate) templates += ",";
    templates += String(templateId);
    firstTemplate = false;
  }
  templates += "]";
  if (firstTemplate) {
    Serial.println("Template sync skipped: sensor has no enrolled templates");
    return false;
  }

  HTTPClient client;
  WiFiClientSecure secureClient;
  secureClient.setInsecure();
  if (!client.begin(secureClient, attendanceApiUrl)) {
    Serial.println("Template sync failed: could not open HTTPS connection");
    return false;
  }
  client.setTimeout(5000);
  client.addHeader("Content-Type", "application/json");
  client.addHeader("x-device-key", deviceKey);

  String payload = "{\"action\":\"deviceSyncTemplates\",\"deviceId\":\"";
  payload += deviceId;
  payload += "\",\"templates\":";
  payload += templates;
  payload += "}";

  const int responseCode = client.POST(payload);
  const String response = responseCode > 0 ? client.getString() : "";
  client.end();
  if (responseCode < 200 || responseCode >= 300 || response.indexOf("\"ok\":true") < 0) {
    Serial.print("Template sync failed, HTTP ");
    Serial.println(responseCode);
    return false;
  }

  Serial.print("Template IDs synchronized to web database: ");
  Serial.println(response);
  return true;
}

void pollDeviceCommands() {
  if (WiFi.status() != WL_CONNECTED || !fingerprintSensorReady) return;

  HTTPClient client;
  WiFiClientSecure secureClient;
  secureClient.setInsecure();
  if (!client.begin(secureClient, attendanceApiUrl)) return;
  client.setTimeout(1500);
  client.addHeader("Content-Type", "application/json");
  client.addHeader("x-device-key", deviceKey);

  String pollPayload = "{\"action\":\"pollDeviceCommands\",\"deviceId\":\"";
  pollPayload += deviceId;
  pollPayload += "\"}";
  int responseCode = client.POST(pollPayload);
  String response = responseCode > 0 ? client.getString() : "";
  client.end();
  if (responseCode < 200 || responseCode >= 300) return;

  int searchFrom = 0;
  bool commandProcessed = false;
  while (true) {
    int idKey = response.indexOf("\"id\":", searchFrom);
    if (idKey < 0) break;
    int idStart = idKey + 5;
    int idEnd = response.indexOf(',', idStart);
    if (idEnd < 0) break;
    int commandId = response.substring(idStart, idEnd).toInt();
    int commandKey = response.indexOf("\"command\":\"", idEnd);
    if (commandKey < 0) break;
    int commandStart = commandKey + 11;
    int commandEnd = response.indexOf('"', commandStart);
    if (commandEnd < 0) break;
    String command = response.substring(commandStart, commandEnd);

    if (command == "SYNC_NICKNAMES" || command == "SYNC_TEMPLATES") {
      bool syncSucceeded = true;
      if (command == "SYNC_TEMPLATES") {
        syncSucceeded = syncSensorTemplatesToServer();
      }

      HTTPClient completeClient;
      WiFiClientSecure completeSecureClient;
      completeSecureClient.setInsecure();
      bool completed = false;
      if (completeClient.begin(completeSecureClient, attendanceApiUrl)) {
        completeClient.setTimeout(1500);
        completeClient.addHeader("Content-Type", "application/json");
        completeClient.addHeader("x-device-key", deviceKey);
        String completePayload = "{\"action\":\"completeDeviceCommand\",\"commandId\":";
        completePayload += String(commandId);
        completePayload += ",\"success\":";
        completePayload += syncSucceeded ? "true}" : "false}";
        int completeResponseCode = completeClient.POST(completePayload);
        completed = completeResponseCode >= 200 && completeResponseCode < 300;
        completeClient.end();
      }
      if (completed && syncSucceeded) commandProcessed = true;
      searchFrom = commandEnd + 1;
      continue;
    }

    int templateKey = response.indexOf("\"templateId\":", idEnd);
    if (templateKey < 0) break;
    int templateStart = templateKey + 13;
    int templateEnd = response.indexOf(',', templateStart);
    if (templateEnd < 0) templateEnd = response.indexOf('}', templateStart);
    if (templateEnd < 0) break;
    int templateId = response.substring(templateStart, templateEnd).toInt();

    bool success = templateId >= 1 && templateId <= 127;
    if (success) {
      success = fingerprint.loadModel(templateId) != FINGERPRINT_OK || fingerprint.deleteModel(templateId) == FINGERPRINT_OK;
      nicknameStore.remove((String("n") + String(templateId)).c_str());
      commandProcessed = true;
    }

    HTTPClient completeClient;
    WiFiClientSecure completeSecureClient;
    completeSecureClient.setInsecure();
    if (completeClient.begin(completeSecureClient, attendanceApiUrl)) {
      completeClient.setTimeout(3000);
      completeClient.addHeader("Content-Type", "application/json");
      completeClient.addHeader("x-device-key", deviceKey);
      String completePayload = "{\"action\":\"completeDeviceCommand\",\"commandId\":";
      completePayload += String(commandId);
      completePayload += ",\"success\":";
      completePayload += success ? "true" : "false";
      completePayload += "}";
      completeClient.POST(completePayload);
      completeClient.end();
    }
    searchFrom = templateEnd + 1;
  }

  if (commandProcessed) syncNicknameCache();
}

void sendDeviceCheckin(uint8_t templateId) {
  if (attendanceRequestInProgress) {
    Serial.println("CHECKIN_DIABAIKAN:REQUEST_MASIH_BERJALAN");
    return;
  }

  attendanceRequestInProgress = true;

  if (!ensureWiFiConnected()) {
    showMessage("ABSEN GAGAL", "WI-FI OFFLINE");
    attendanceRequestInProgress = false;
    return;
  }

  HTTPClient client;
  WiFiClientSecure secureClient;
  secureClient.setInsecure();
  secureClient.setHandshakeTimeout(attendanceHttpsHandshakeTimeoutSeconds);
  if (!client.begin(secureClient, attendanceApiUrl)) {
    Serial.println("deviceCheckin gagal membuka koneksi HTTPS");
    showMessage("ABSEN GAGAL", "SERVER OFFLINE");
    delay(1500);
    attendanceRequestInProgress = false;
    return;
  }
  client.setTimeout(attendanceHttpsTimeoutMs);
  client.setConnectTimeout(attendanceHttpsConnectTimeoutMs);
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
  if (responseCode <= 0) {
    Serial.print("deviceCheckin transport error: ");
    Serial.println(HTTPClient::errorToString(responseCode));
    Serial.print("WiFi RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.print(" dBm, free heap: ");
    Serial.println(ESP.getFreeHeap());
    client.end();

    // A lost response is safe to retry: the API blocks duplicate attendance.
    if (ensureWiFiConnected()) {
      WiFiClientSecure retrySecureClient;
      retrySecureClient.setInsecure();
      retrySecureClient.setHandshakeTimeout(attendanceHttpsHandshakeTimeoutSeconds);
      HTTPClient retryClient;
      if (retryClient.begin(retrySecureClient, attendanceApiUrl)) {
        retryClient.setTimeout(attendanceHttpsTimeoutMs);
        retryClient.setConnectTimeout(attendanceHttpsConnectTimeoutMs);
        retryClient.addHeader("Content-Type", "application/json");
        retryClient.addHeader("x-device-key", deviceKey);
        responseCode = retryClient.POST(payload);
        response = responseCode > 0 ? retryClient.getString() : "";
        retryClient.end();
      }
    }
  }
  Serial.print("deviceCheckin HTTP: ");
  Serial.println(responseCode);
  if (response.length() > 0) {
    Serial.print("deviceCheckin response: ");
    Serial.println(response);
  }
  if (responseCode >= 200 && responseCode < 300) {
    if (responseWasSkipped(response)) {
      String skippedTime = getResponseField(response, "attendanceTime", "00:00");
      String skippedStatus = getResponseField(response, "attendanceStatus", "Hadir");
      String skippedMessage = skippedStatus == "Pulang" ? "KELUAR " : "MASUK ";
      skippedMessage += skippedTime;
      showMessage("ANDA TELAH", "ABSEN");
      delay(attendanceResultDisplayMs);
      showMessage("ANDA TELAH", skippedMessage.c_str());
      delay(attendanceResultDisplayMs);
      showAttendanceStandby();
      client.end();
      attendanceRequestInProgress = false;
      return;
    }

    String nickname = getEmployeeName(response);
    if (nickname.length() > lcdColumns) {
      nickname = nickname.substring(0, lcdColumns);
    }
    String attendanceTime = getResponseField(response, "attendanceTime", "00:00");
    String attendanceStatus = getResponseField(response, "attendanceStatus", "Hadir");
    String attendanceMessage = attendanceStatus == "Pulang" ? "KELUAR " : "MASUK ";
    attendanceMessage += attendanceTime;
    showMessage(nickname.c_str(), attendanceMessage.c_str());
    delay(attendanceResultDisplayMs);
    showAttendanceStandby();
  } else {
    if (responseCode <= 0) {
      showMessage("ABSEN GAGAL", "SERVER TIMEOUT");
    } else if (response.indexOf("Template not mapped") >= 0) {
      showMessage("ABSEN GAGAL", "ID BELUM MAP");
    } else if (response.indexOf("employee not found") >= 0) {
      showMessage("ABSEN GAGAL", "PEGAWAI HILANG");
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
  attendanceRequestInProgress = false;
}

void sendDeviceEnroll(uint8_t templateId) {
  if (!ensureWiFiConnected()) {
    showMessage("DAFTAR GAGAL", "WI-FI OFFLINE");
    return;
  }

  HTTPClient client;
  WiFiClientSecure secureClient;
  secureClient.setInsecure();
  if (!client.begin(secureClient, attendanceApiUrl)) {
    showMessage("DAFTAR GAGAL", "SERVER OFFLINE");
    Serial.println("deviceEnroll gagal membuka koneksi HTTPS");
    return;
  }
  client.setTimeout(5000);
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
  String response = responseCode > 0 ? client.getString() : "";
  if (responseCode > 0) {
    Serial.print("deviceEnroll HTTP: ");
    Serial.println(responseCode);
    if (response.length() > 0) {
      Serial.print("deviceEnroll response: ");
      Serial.println(response);
    }
    if (responseCode >= 200 && responseCode < 300 && response.indexOf("\"ok\":true") >= 0) {
      showMessage("ID TERSIMPAN", "MAP DI WEB ADMIN");
      syncSensorTemplatesToServer();
    } else {
      showMessage("DAFTAR GAGAL", "SERVER MENOLAK");
    }
  } else {
    showMessage("DAFTAR GAGAL", "SERVER OFFLINE");
  }
  client.end();
}

void updateStandbyScreen() {
  showAttendanceStandby();
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
  uint32_t startedAt = millis();
  while (fingerprint.getImage() == FINGERPRINT_OK && millis() - startedAt < fingerReleaseTimeoutMs) {
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
  if (attendanceRequestInProgress) return;
  if (millis() - lastScanAt < 350) return;
  lastScanAt = millis();

  if (!fingerprintSensorReady) {
    recoverFingerprintSensor();
    return;
  }

  uint8_t imageResult = fingerprint.getImage();
  if (imageResult == FINGERPRINT_NOFINGER) return;
  if (imageResult != FINGERPRINT_OK) {
    Serial.print("Fingerprint getImage error: ");
    Serial.println(imageResult);
    fingerprintSensorReady = false;
    showMessage("SENSOR FP", "COBA LAGI");
    recoverFingerprintSensor();
    return;
  }

  if (fingerprint.image2Tz() == FINGERPRINT_OK && fingerprint.fingerSearch() == FINGERPRINT_OK) {
    String nickname = getCachedNickname(fingerprint.fingerID);
    if (nickname.length() > 0) {
      if (nickname.length() > lcdColumns) nickname = nickname.substring(0, lcdColumns);
      showMessage(nickname.c_str(), "SEDANG MEMPROSES");
    } else {
      showMessage("SIDIK JARI OK", "SEDANG MEMPROSES");
    }
    sendDeviceCheckin(fingerprint.fingerID);
  } else {
    Serial.println("Sidik jari gagal dikonversi atau tidak ditemukan");
    showMessage("SIDIK JARI", "TIDAK ADA");
    playErrorSound();
  }

  uint32_t releaseStartedAt = millis();
  while (fingerprint.getImage() == FINGERPRINT_OK && millis() - releaseStartedAt < attendanceFingerReleaseTimeoutMs) {
    delay(50);
  }
  if (millis() - releaseStartedAt >= attendanceFingerReleaseTimeoutMs) {
    Serial.println("Jari belum diangkat, lanjutkan loop absensi");
  }
  updateStandbyScreen();
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
        const uint8_t existingId = fingerprint.fingerID;
        const bool synced = syncSensorTemplatesToServer();
        playErrorSound();
        showMessage(synced ? "ID TERDAFTAR" : "SIDIK DI SENSOR", "MAP DI WEB ADMIN");
        Serial.print("Fingerprint already enrolled, template ID: ");
        Serial.println(existingId);
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
        const uint8_t existingId = fingerprint.fingerID;
        const bool synced = syncSensorTemplatesToServer();
        playErrorSound();
        showMessage(synced ? "ID TERDAFTAR" : "SIDIK DI SENSOR", "MAP DI WEB ADMIN");
        Serial.print("Fingerprint already enrolled, template ID: ");
        Serial.println(existingId);
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
    snprintf(verificationLine, sizeof(verificationLine), "VERIFY %d/3", verification);
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