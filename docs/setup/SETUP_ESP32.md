# Setup ESP32 Fingerprint Integration for Absensi

Dokumentasi ini menjelaskan langkah-langkah lengkap untuk menghubungkan ESP32 + sensor AS608 ke backend `absensi`.

## 1. Konfigurasi backend `absensi`

1. Buka folder `d:\Absensi\absensi`
2. Pastikan backend sudah terpasang:
   ```bash
   npm install
   ```
3. Buat file `.env.local` di folder `absensi` dengan isi:
   ```env
   DATABASE_URL="mysql://root@localhost:3306/absensi_db"
   DEVICE_KEY=rahasia123
   WEBAUTHN_ORIGIN=http://localhost:3000
   WEBAUTHN_RPID=localhost
   ```
4. Jalankan backend:
   ```bash
   npm run dev
   ```
5. Buka browser di `http://localhost:3000` dan pastikan aplikasi berjalan.

> Jika ESP32 tidak berada di PC yang sama, ganti `localhost` dengan IP lokal PC Anda, misal `http://192.168.1.50:3000`.

## 2a. Mode ESP32 dengan LCD I2C

Sketch `firmware/fingerprint_sensor/fingerprint_sensor.ino` menggunakan LCD I2C 16x2 dan tidak membutuhkan Serial Monitor untuk operasi harian.

Pasang library **LiquidCrystal I2C** dari Library Manager Arduino IDE. Wiring LCD ke ESP32:

| LCD I2C | ESP32 |
|---|---|
| VCC | 5V |
| GND | GND |
| SDA | GPIO 21 |
| SCL | GPIO 22 |

Alamat default LCD adalah `0x27`. Jika LCD tidak menyala, coba ubah menjadi `0x3F` pada baris `LiquidCrystal_I2C lcd(...)`.

Tombol tetap menggunakan GPIO 19 untuk daftar dan GPIO 23 untuk batal. Penghapusan fingerprint dilakukan dari halaman admin melalui endpoint web.

## 2b. Mode simultan dengan Serial Monitor

Sketch `firmware/ESP32_STATUS_SERVER/ESP32_STATUS_SERVER.ino` mengirim hasil scan dan pendaftaran ke API melalui Wi-Fi. Dengan mode ini, Serial Monitor boleh tetap terbuka karena web tidak lagi membaca `COM7`.

Sesuaikan tiga konstanta pada sketch:

```cpp
const char* attendanceApiUrl = "http://<IP-PC>:3000/api/attendance";
const char* deviceKey = "<DEVICE_KEY>";
const char* deviceId = "ESP32-01";
```

Pastikan PC dan ESP32 berada pada jaringan yang sama, jalankan Next.js dengan host LAN, lalu upload sketch. Admin akan memperbarui data dari API melalui Wi-Fi.

## 2. Endpoint yang digunakan ESP32

ESP32 akan mengirim request ke endpoint:

- `POST http://<server-ip>:3000/api/attendance`
- Header:
  - `Content-Type: application/json`
  - `x-device-key: rahasia123`
- Body JSON:
  - `{"action":"deviceEnroll","deviceId":"ESP32-01","templateId":12,"employeeId":5,"templateData":"<template-bytes-or-string>"}`
  - `{"action":"deviceCheckin","deviceId":"ESP32-01","templateId":12}`

> `employeeId` bersifat opsional saat enroll. Jika tidak dikirim, template disimpan sebagai belum dipetakan; hubungkan ke pegawai di halaman Admin sebelum absensi. Jika pegawai memiliki `pendingFingerprintId` yang sama, backend dapat memetakan otomatis. Firmware utama juga mengirim daftar ID yang tersimpan di sensor secara berkala sehingga ID yang gagal terkirim saat pendaftaran dapat direkonsiliasi.

## 3. Alur kerja perangkat

1. Untuk penggunaan dengan Vercel/production, upload sketch utama `firmware/fingerprint_sensor/fingerprint_sensor.ino`. Sketch ini mengirim daftar ID yang benar-benar tersimpan di sensor ke backend setelah boot dan setiap 60 detik saat Wi-Fi online. Sketch `firmware/ESP32_STATUS_SERVER/ESP32_STATUS_SERVER.ino` adalah mode lama untuk integrasi lokal/Serial dan tidak melakukan sinkronisasi cloud ini.
2. Pastikan `attendanceApiUrl`, `DEVICE_KEY`, dan `deviceId` pada firmware sesuai dengan backend dan secret Vercel. Tombol **Sinkronkan dari ESP32** di Admin mengantrekan perintah; perangkat memprosesnya saat online.
3. Jika `pendingFingerprintId` pegawai sama persis dengan ID sensor, backend memetakan otomatis. Selain itu, cocokkan ID dengan pegawai yang benar lalu klik **Map**. Jangan menghapus atau mendaftarkan ulang sidik jari yang LCD-nya mengatakan sudah terdaftar.

Sesudah template disinkronkan:

- `deviceEnroll` menyimpan templateId ke `fingerprint_mappings`. Jika `employeeId` atau `pendingFingerprintId` yang cocok tersedia, mapping terikat ke pegawai; jika tidak, mapping tetap menunggu pemetaan manual.
- Untuk mapping manual, buka halaman Admin, pilih pegawai yang sudah diverifikasi untuk ID tersebut, lalu klik **Map**.
- `deviceCheckin` mencatat absensi ketika sidik jari dikenali dan templateId sudah terhubung ke employeeId.

## 4. Contoh sketch ESP32 lengkap

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_Fingerprint.h>

// --- Konfigurasi Wi-Fi ---
const char* ssid = "<WIFI_SSID>";
const char* password = "<WIFI_PASSWORD>";

// --- Konfigurasi Backend ---
const char* serverUrl = "http://192.168.1.50:3000/api/attendance"; // ganti dengan IP PC Anda
const char* deviceKey = "<DEVICE_KEY>";
const char* deviceId = "ESP32-01";

// --- Konfigurasi Sidik Jari ---
#define RX2_PIN 32
#define TX2_PIN 33
#define BUTTON_ENROLL_PIN 19
#define BUTTON_VERIFY_PIN 23

HardwareSerial mySerial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);
uint8_t id = 1;
int lastEnrollState = LOW;
int lastVerifyState = LOW;

void setup() {
  Serial.begin(115200);
  while (!Serial);
  delay(1000);

  pinMode(BUTTON_ENROLL_PIN, INPUT_PULLDOWN);
  pinMode(BUTTON_VERIFY_PIN, INPUT_PULLDOWN);
  delay(50);

  Serial.println("\n--- Memulai Inisialisasi Sistem ---");
  WiFi.begin(ssid, password);
  Serial.print("Menghubungkan ke Wi-Fi");

  int wifiTimeout = 0;
  while (WiFi.status() != WL_CONNECTED && wifiTimeout < 20) {
    delay(500);
    Serial.print(".");
    wifiTimeout++;
  }

  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Terhubung ke Wi-Fi!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("GAGAL terhubung ke Wi-Fi! Melanjutkan mode OFFLINE.");
  }

  Serial.println("\n--- Sistem Sidik Jari ESP32 ---");
  mySerial.begin(57600, SERIAL_8N1, RX2_PIN, TX2_PIN);
  finger.begin(57600);

  if (finger.verifyPassword()) {
    Serial.println("Sensor AS608 Ditemukan dan Siap!");
  } else {
    Serial.println("Sensor AS608 TIDAK Ditemukan. Periksa kabel Anda!");
    while (1) { delay(1); }
  }

  lastEnrollState = digitalRead(BUTTON_ENROLL_PIN);
  lastVerifyState = digitalRead(BUTTON_VERIFY_PIN);

  Serial.println("Sistem Berjalan! Mode STANDBY.");
  Serial.println("Tekan GPIO 19 (DAFTAR) atau GPIO 23 (VERIFIKASI).");
}

void loop() {
  int enrollReading = digitalRead(BUTTON_ENROLL_PIN);
  int verifyReading = digitalRead(BUTTON_VERIFY_PIN);

  if (enrollReading == HIGH && lastEnrollState == LOW) {
    delay(50);
    if (digitalRead(BUTTON_ENROLL_PIN) == HIGH) {
      Serial.println("\n[MODE] Pendaftaran Aktif...");
      id = getFreeID();
      if (id > 0) {
        enrollFingerprint();
      } else {
        Serial.println("Kapasitas sensor penuh!");
      }
      Serial.println("Sistem kembali standby.\n");
    }
  } else if (verifyReading == HIGH && lastVerifyState == LOW) {
    delay(50);
    if (digitalRead(BUTTON_VERIFY_PIN) == HIGH) {
      Serial.println("\n[MODE] Verifikasi Aktif! Silakan tempelkan jari (Waktu: 5 Detik)...");
      verifyFingerprint(5000);
      Serial.println("Sistem kembali standby.\n");
    }
  }

  lastEnrollState = enrollReading;
  lastVerifyState = verifyReading;
  delay(50);
}

void verifyFingerprint(uint32_t timeoutMs) {
  unsigned long startTime = millis();
  int p = -1;

  while (millis() - startTime < timeoutMs) {
    p = finger.getImage();
    if (p == FINGERPRINT_OK) break;
    delay(50);
  }

  if (p != FINGERPRINT_OK) {
    Serial.println("Waktu habis! Tidak ada jari yang terdeteksi.");
    return;
  }

  p = finger.image2Tz();
  if (p != FINGERPRINT_OK) {
    Serial.println("Gambar terlalu berantakan.");
    return;
  }

  p = finger.fingerSearch();
  if (p == FINGERPRINT_OK) {
    Serial.print("VERIFIKASI SUKSES! ID: ");
    Serial.println(finger.fingerID);
    sendDeviceCheckin(finger.fingerID);
  } else {
    Serial.println("AKSES DITOLAK! Jari tidak terdaftar.");
  }
}

void enrollFingerprint() {
  int p = -1;
  Serial.print("Menunggu jari PERTAMA untuk ID #");
  Serial.println(id);

  while (p != FINGERPRINT_OK) {
    p = finger.getImage();
    delay(50);
  }
  Serial.println("Jari pertama terdeteksi!");

  p = finger.image2Tz(1);
  if (p != FINGERPRINT_OK) {
    Serial.println("Gagal konversi gambar 1.");
    return;
  }

  Serial.println("Silakan angkat jari Anda!");
  delay(1000);

  p = 0;
  Serial.println("Menunggu jari diangkat...");
  while (p != FINGERPRINT_NOFINGER) {
    p = finger.getImage();
    delay(50);
  }
  Serial.println("Jari berhasil diangkat.");

  Serial.println("Letakkan kembali jari yang SAMA...");
  p = -1;
  while (p != FINGERPRINT_OK) {
    p = finger.getImage();
    delay(50);
  }
  Serial.println("Jari kedua terdeteksi!");

  p = finger.image2Tz(2);
  if (p != FINGERPRINT_OK) {
    Serial.println("Gagal konversi gambar 2.");
    return;
  }

  p = finger.createModel();
  if (p == FINGERPRINT_OK) {
    Serial.println("Model sidik jari cocok!");
  } else {
    Serial.println("Sidik jari tidak cocok antar pendaftaran.");
    return;
  }

  p = finger.storeModel(id);
  if (p == FINGERPRINT_OK) {
    Serial.println("Pendaftaran Berhasil disimpan!");
    sendDeviceEnroll(id);
  } else {
    Serial.println("Gagal menyimpan ke memori AS608.");
  }
}

uint8_t getFreeID() {
  for (int i = 1; i <= 127; i++) {
    if (finger.loadModel(i) != FINGERPRINT_OK) {
      return i;
    }
  }
  return 0;
}

void sendDeviceEnroll(uint32_t templateId) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi tidak terhubung, tidak dapat mengirim deviceEnroll.");
    return;
  }

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", deviceKey);

  String body = "{\"action\":\"deviceEnroll\",\"deviceId\":\"" + String(deviceId) + "\",\"templateId\":" + String(templateId) + "}";
  int status = http.POST(body);

  Serial.print("deviceEnroll status: ");
  Serial.println(status);
  Serial.println(http.getString());
  http.end();
}

void sendDeviceCheckin(uint32_t templateId) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi tidak terhubung, tidak dapat mengirim deviceCheckin.");
    return;
  }

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", deviceKey);

  String body = "{\"action\":\"deviceCheckin\",\"deviceId\":\"" + String(deviceId) + "\",\"templateId\":" + String(templateId) + "}";
  int status = http.POST(body);

  Serial.print("deviceCheckin status: ");
  Serial.println(status);
  Serial.println(http.getString());
  http.end();
}
```

## 5. Langkah pengujian

1. Upload sketch ke ESP32.
2. Buka Serial Monitor di 115200 bps.
3. Pastikan ESP32 berhasil terhubung Wi-Fi.
4. Tekan tombol enroll (`GPIO 19`) dan ikuti instruksi.
5. Setelah enroll, buka `http://localhost:3000/admin` lalu map `templateId` ke pegawai.
6. Tekan tombol verify (`GPIO 23`) dengan jari terdaftar.
7. Pastikan output `deviceCheckin status: 200` di Serial Monitor.

## 6. Catatan penting

- `deviceCheckin` hanya sukses setelah `templateId` sudah di-map ke `employeeId`.
- Jika ESP32 tidak di PC yang sama, ganti `serverUrl` dengan IP PC, bukan `localhost`.
- `DEVICE_KEY` di ESP32 harus sama dengan nilai di `.env.local`.
