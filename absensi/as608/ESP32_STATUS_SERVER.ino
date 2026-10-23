#include <WiFi.h>
#include <WebServer.h>
#include <Adafruit_Fingerprint.h>
#include <LiquidCrystal_I2C.h>

// Ganti dengan SSID dan password Wi‑Fi yang benar di jaringan Anda.
// Pastikan jaringan yang dipakai adalah 2.4 GHz agar ESP32 bisa terhubung stabil.
const char* ssid = "WH Prapatan Atas";
const char* password = "tangguhoptima2026";

WebServer server(3000);
HardwareSerial fingerprintSerial(2);
Adafruit_Fingerprint fingerprint = Adafruit_Fingerprint(&fingerprintSerial);
LiquidCrystal_I2C lcd(0x27, 16, 2);

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
uint32_t lastStandbyPageAt = 0;
bool showingEnrollmentHint = false;

void sendScanResult();
void enrollFromButton();
void handleSerialCommand();
void scanContinuously();
void beep(uint16_t frequency, uint16_t durationMs);
void playSuccessSound();
void playErrorSound();
uint8_t findFreeFingerprintId();
bool waitForFingerImage(uint32_t timeoutMs);
void showMessage(const char* line1, const char* line2);
void updateStandbyScreen();
void updateStandbyPage();
bool cancelPressed();

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(enrollButtonPin, INPUT_PULLDOWN);
  pinMode(cancelButtonPin, INPUT_PULLDOWN);
  pinMode(buzzerPin, OUTPUT);
  noTone(buzzerPin);

  lcd.init();
  lcd.backlight();
  updateStandbyScreen();

  fingerprintSerial.begin(fingerprintBaudRate, SERIAL_8N1, fingerprintRxPin, fingerprintTxPin);
  fingerprint.begin(fingerprintBaudRate);
  if (!fingerprint.verifyPassword()) {
    Serial.println("FINGERPRINT_SENSOR_ERROR");
    showMessage("Sensor fingerprint", "GAGAL / cek kabel");
  } else {
    fingerprintSensorReady = true;
    Serial.println("FINGERPRINT_READY");
    showMessage("Sensor fingerprint", "siap");
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.println("--- Memulai Inisialisasi Sistem ---");
  Serial.print("Menghubungkan ke Wi-Fi");

  int timeout = 0;
  while (WiFi.status() != WL_CONNECTED && timeout < 40) {
    delay(500);
    Serial.print(".");
    timeout++;
  }

  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Terhubung ke Wi-Fi!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("GAGAL terhubung ke Wi-Fi!");
    Serial.println("Mode USB offline tetap aktif.");
  }

  Serial.println("DEVICE_READY");
  if (!fingerprintSensorReady) {
    showMessage("Sensor fingerprint", "GAGAL / cek kabel");
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

  server.on("/api/templates", HTTP_GET, []() {
    if (!fingerprintSensorReady) {
      server.send(503, "application/json", "{\"error\":\"Sensor fingerprint tidak siap\"}");
      return;
    }

    String json = "{\"templates\":[";
    bool firstTemplate = true;
    for (uint8_t id = 1; id <= 127; id++) {
      if (fingerprint.loadModel(id) != FINGERPRINT_OK) continue;
      if (!firstTemplate) json += ",";
      json += String(id);
      firstTemplate = false;
    }
    json += "]}";
    server.send(200, "application/json", json);
  });

  server.begin();
  Serial.println("Server aktif di port 3000");

  lastEnrollButtonState = digitalRead(enrollButtonPin);
  lastCancelButtonState = digitalRead(cancelButtonPin);
  continuousScanMode = true;
  updateStandbyScreen();
}

void loop() {
  server.handleClient();

  if (Serial.available()) handleSerialCommand();

  int enrollButtonState = digitalRead(enrollButtonPin);
  int cancelButtonState = digitalRead(cancelButtonPin);
  if (enrollButtonState == HIGH && lastEnrollButtonState == LOW) {
    delay(50);
    if (digitalRead(enrollButtonPin) == HIGH) {
      continuousScanMode = false;
      beep(880, 120);
      enrollFromButton();
    }
  }

  if (cancelButtonState == HIGH && lastCancelButtonState == LOW) {
    beep(660, 120);
    if (enrollmentActive) {
      cancelRequested = true;
      Serial.println("ENROLL_CANCELLED");
      showMessage("Pendaftaran", "dibatalkan");
    } else {
      showMessage("Scan otomatis", "tetap aktif");
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

void showMessage(const char* line1, const char* line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
}

void updateStandbyScreen() {
  showingEnrollmentHint = true;
  lastStandbyPageAt = millis();
  showMessage("Jari utk absen", "Tekan utk daftar");
}

void updateStandbyPage() {
  showingEnrollmentHint = !showingEnrollmentHint;
  lastStandbyPageAt = millis();
  if (showingEnrollmentHint) {
    showMessage("Tempelkan jari", "Tekan utk daftar");
  } else {
    showMessage("Tempelkan jari", "utk absen");
  }
}

bool cancelPressed() {
  if (digitalRead(cancelButtonPin) == HIGH && !cancelRequested) {
    cancelRequested = true;
    beep(660, 120);
    Serial.println("ENROLL_CANCELLED");
    showMessage("Pendaftaran", "dibatalkan");
    lastCancelButtonState = HIGH;
  }
  return cancelRequested;
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

void handleSerialCommand() {
  String command = Serial.readStringUntil('\n');
  command.trim();
  command.toUpperCase();

  if (command == "START_SCAN") {
    continuousScanMode = true;
    Serial.println("SCAN_MODE_ON");
    return;
  }

  if (command == "STOP_SCAN") {
    continuousScanMode = false;
    Serial.println("SCAN_MODE_OFF");
    return;
  }

  if (!command.startsWith("DELETE ")) return;

  if (command == "DELETE ALL") {
    bool success = true;
    for (int templateId = 1; templateId <= 127; templateId++) {
      uint8_t result = fingerprint.deleteModel(templateId);
      if (result != FINGERPRINT_OK && result != FINGERPRINT_PACKETRECIEVEERR) {
        success = false;
      }
    }
    Serial.println(success ? "DELETE_ALL_OK" : "DELETE_ALL_ERROR:SENSOR");
    return;
  }

  int id = command.substring(7).toInt();
  if (id < 1 || id > 127) {
    Serial.println("DELETE_ERROR:INVALID_ID");
    return;
  }

  if (fingerprint.deleteModel(id) == FINGERPRINT_OK) {
    Serial.print("DELETE_OK:");
    Serial.println(id);
  } else {
    Serial.println("DELETE_ERROR:SENSOR");
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

void scanContinuously() {
  static uint32_t lastScanAt = 0;
  if (millis() - lastScanAt < 350) return;
  lastScanAt = millis();

  if (!fingerprintSensorReady) return;

  uint8_t imageResult = fingerprint.getImage();
  if (imageResult != FINGERPRINT_OK) return;

  if (fingerprint.image2Tz() == FINGERPRINT_OK && fingerprint.fingerSearch() == FINGERPRINT_OK) {
    showMessage("Absensi berhasil", "ID tersimpan");
    playSuccessSound();
    Serial.print("FINGERPRINT_ID:");
    Serial.println(fingerprint.fingerID);
  } else {
    showMessage("Sidik jari", "tidak terdaftar");
    playErrorSound();
    Serial.println("SCAN_ERROR");
  }

  while (fingerprint.getImage() == FINGERPRINT_OK) delay(50);
  updateStandbyScreen();
}

void sendScanResult() {
  if (!waitForFingerImage(10000) || fingerprint.image2Tz() != FINGERPRINT_OK || fingerprint.fingerSearch() != FINGERPRINT_OK) {
    playErrorSound();
    Serial.println("SCAN_ERROR");
    return;
  }

  playSuccessSound();
  Serial.print("FINGERPRINT_ID:");
  Serial.println(fingerprint.fingerID);
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
  showMessage("Mode daftar", "GPIO23 batal");

  uint8_t id = findFreeFingerprintId();
  if (id == 0) {
    playErrorSound();
    Serial.println("ENROLL_ERROR:FULL");
    enrollmentActive = false;
    continuousScanMode = true;
    updateStandbyScreen();
    return;
  }

  showMessage("Tempel jari", "pertama");
  Serial.println("ENROLL_WAIT_1");
  if (!waitForFingerImage(15000) || cancelRequested || fingerprint.image2Tz(1) != FINGERPRINT_OK) {
    playErrorSound();
    Serial.println("ENROLL_ERROR:FIRST_FINGER");
    enrollmentActive = false;
    continuousScanMode = true;
    updateStandbyScreen();
    return;
  }

  showMessage("Angkat jari", "sebentar");
  Serial.println("ENROLL_LIFT");
  while (fingerprint.getImage() != FINGERPRINT_NOFINGER) {
    if (cancelPressed()) {
      playErrorSound();
      enrollmentActive = false;
      continuousScanMode = true;
      updateStandbyScreen();
      return;
    }
    delay(50);
  }
  delay(500);

  showMessage("Tempel jari", "kedua");
  Serial.println("ENROLL_WAIT_2");
  if (!waitForFingerImage(15000) || cancelRequested || fingerprint.image2Tz(2) != FINGERPRINT_OK || fingerprint.createModel() != FINGERPRINT_OK) {
    playErrorSound();
    Serial.println("ENROLL_ERROR:SECOND_FINGER");
    enrollmentActive = false;
    continuousScanMode = true;
    updateStandbyScreen();
    return;
  }

  if (fingerprint.storeModel(id) != FINGERPRINT_OK) {
    playErrorSound();
    Serial.println("ENROLL_ERROR:STORE");
    enrollmentActive = false;
    continuousScanMode = true;
    updateStandbyScreen();
    return;
  }

  Serial.println("ENROLL_VERIFY_3X");
  for (int verification = 1; verification <= 3; verification++) {
    char verificationLine[17];
    snprintf(verificationLine, sizeof(verificationLine), "Verifikasi %d/3", verification);
    showMessage(verificationLine, "Tempel jari");
    Serial.print("TEMPELKAN_JARI_VERIFIKASI:");
    Serial.println(verification);
    for (int beepCount = 0; beepCount < verification; beepCount++) beep(740, 140);

    if (!waitForFingerImage(15000) || cancelRequested || fingerprint.image2Tz() != FINGERPRINT_OK || fingerprint.fingerSearch() != FINGERPRINT_OK || fingerprint.fingerID != id) {
      playErrorSound();
      Serial.print("ENROLL_ERROR:VERIFY_");
      Serial.println(verification);
      enrollmentActive = false;
      continuousScanMode = true;
      updateStandbyScreen();
      return;
    }

    beep(980, 100);
    Serial.print("ENROLL_VERIFY_OK:");
    Serial.println(verification);
    while (fingerprint.getImage() == FINGERPRINT_OK) delay(50);
    delay(300);
  }

  playSuccessSound();
  for (int beepCount = 0; beepCount < 3; beepCount++) beep(1319, 140);
  showMessage("Daftar berhasil", "3x verifikasi OK");
  Serial.print("ENROLL_OK:");
  Serial.println(id);
  enrollmentActive = false;
  continuousScanMode = true;
  delay(1200);
  updateStandbyScreen();
}
