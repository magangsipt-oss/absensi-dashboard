# Troubleshooting ESP32 Fingerprint "Absen Gagal Cek Server"

## 🔴 Problem Identified

Pesan "Absen gagal - Periksa server" muncul karena ESP32 tidak dapat terhubung ke web server untuk melakukan verifikasi absensi.

### Root Causes:

**1. IP Server Hardcoded Salah (PRIMARY ISSUE)**
- File: `firmware/fingerprint_sensor/fingerprint_sensor.ino` (line 25)
- Current IP: `http://192.168.137.235:3000/api/attendance`
- Actual Server IP: Sesuai dengan jaringan Wi‑Fi `SHINN` yang Anda pakai.

**2. Kemungkinan Penyebab Lainnya:**
- ❌ WiFi ESP32 tidak terhubung
- ❌ `DEVICE_KEY` di backend tidak sama dengan key yang dikonfigurasi pada firmware
- ❌ Endpoint `/api/attendance` tidak ada (tapi ada ✓)
- ❌ Server tidak menerima request dengan status 200-299

---

## ✅ Solutions

### SOLUSI 1: Update IP di Kode ESP32 (Quick Fix)

1. **Cari tahu IP server Anda sekarang:**
   - Di terminal, jalankan: `ipconfig` (Windows) atau `ifconfig` (Linux)
   - Cari IP lokal (biasanya `192.168.x.x` atau `10.x.x.x`)
   - Atau cek di `.env.local` file: `WEBAUTHN_ORIGIN=http://192.168.1.169:3000`

2. **Update file `firmware/fingerprint_sensor/fingerprint_sensor.ino`:**
   ```cpp
   // Line 25 - UBAH INI:
   const char* attendanceApiUrl = "http://YOUR_SERVER_IP:3000/api/attendance";
   // CONTOH:
const char* attendanceApiUrl = "http://192.168.137.235:3000/api/attendance";
### SOLUSI 2: Setup Konfigurasi Dinamis (Better Solution)

Buat file `data/esp32-config.json` untuk menyimpan konfigurasi server:
```json
{
   "serverUrl": "http://<SERVER_IP>:3000/api/attendance",
   "deviceKey": "<DEVICE_KEY>",
   "ssid": "<WIFI_SSID>",
   "password": "<WIFI_PASSWORD>"
}
```

Kemudian modify ESP32 code untuk membaca dari SPIFFS (file system).

### SOLUSI 3: Gunakan mDNS/Hostname (Best Practice)

Ganti hardcoded IP dengan hostname:
```cpp
const char* attendanceApiUrl = "http://absensi-server.local:3000/api/attendance";
```

Ini memungkinkan ESP32 otomatis menemukan server asalkan server mengaktifkan mDNS.

---

## 🔍 Verification Steps

Setelah update, pastikan:

1. **ESP32 terhubung ke WiFi:**
   - Lihat LCD display menunjukkan "Sensor fingerprint siap"
   - Tidak ada "Wi-Fi gagal"

2. **Test koneksi ke server:**
   - Dari terminal: `curl http://YOUR_SERVER_IP:3000/api/attendance`
   - Harus return status 200 dengan JSON data

3. **Test absensi:**
   - Tempelkan jari yang sudah terdaftar
   - Pesan harus berubah dari "Absen gagal" menjadi "[NAMA] berhasil absen"

---

## 📊 Current Configuration Issues

| Komponen | Status | Issue |
|----------|--------|-------|
| Web Server | ✅ Running | URL: http://localhost:3000 |
| .env.local DEVICE_KEY | ✅ Set | Value: `rahasia123` |
| /api/attendance endpoint | ✅ Exists | Handler ready |
| ESP32 IP Config | ✅ **CORRECT** | IP: 192.168.137.187 |
| WiFi Connection | ✅ OK | Configured Wi-Fi network |

---

## 📝 Additional Notes

- Jika IP berubah-ubah, gunakan static IP atau hostname
- Jika sering error timeout, cek WiFi signal strength ESP32
- Jika tetap error setelah update IP, periksa firewall server
- Database logs ada di `/api/attendance` response untuk debugging
