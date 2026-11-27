# Setup Arduino IP Configuration

Fitur ini memungkinkan Anda untuk memasukkan dan mengatur IP address Arduino/ESP32 langsung dari dashboard aplikasi, tanpa perlu mengubah kode atau environment variable.

## 🎯 Cara Menggunakan

### 1. Buka Halaman Settings Arduino
- Masuk ke dashboard admin: `http://localhost:3000/admin`
- Klik tombol **⚙️ Pengaturan** di pojok kanan atas
- Anda akan dibawa ke halaman konfigurasi Arduino

### 2. Masukkan Informasi Arduino
Isi form dengan data Arduino Anda:
- **Device ID**: Identitas unik Arduino (contoh: `ESP32-01`, `ESP32-DEVKITC V4`)
- **IP Address Arduino**: Alamat IP lokal Arduino di jaringan (contoh: `192.168.1.100`)
- **Port**: Port yang digunakan Arduino (default: `3000`)

### 3. Test Koneksi (Opsional)
Klik tombol **Test Koneksi** untuk memverifikasi bahwa Arduino dapat diakses:
- Status akan menunjukkan: `Connected`, `Offline`, atau `Timeout`
- Ini memastikan Arduino aktif dan dapat berkomunikasi

### 4. Simpan Konfigurasi
Klik tombol **Simpan Konfigurasi** untuk:
- Menyimpan IP address Arduino
- Melakukan test koneksi secara otomatis
- Menampilkan status koneksi

## 🔍 Cara Mencari IP Arduino

Jika Anda tidak tahu IP Arduino, ikuti langkah-langkah berikut:

### Menggunakan Arduino IDE Serial Monitor
1. Buka **Arduino IDE**
2. Hubungkan ESP32/Arduino ke komputer via USB
3. Buka **Tools → Serial Monitor** (atau tekan `Ctrl + Shift + M`)
4. Atur baud rate ke **115200**
5. Arduino akan menampilkan informasi koneksi Wi-Fi, termasuk IP
6. Cari baris yang berisi: `IP: 192.168.x.x`
7. Salin IP tersebut dan masukkan ke form di halaman settings

### Menggunakan Router/Network Scanner
1. Akses router management page (biasanya `192.168.1.1`)
2. Lihat daftar perangkat yang terhubung
3. Cari device dengan nama `ESP32` atau `Arduino`
4. Catat IP address-nya

### Menggunakan Command Line
**Windows (PowerShell):**
```powershell
arp -a
```
Cari device yang memiliki nama atau OUI (Organizationally Unique Identifier) Espressif (pembuat ESP32)

**Linux/Mac:**
```bash
arp -a
```
Atau gunakan `nmap`:
```bash
nmap -sn 192.168.1.0/24
```

## 📊 Status Koneksi

Halaman settings menampilkan status koneksi Arduino:

| Status | Arti | Aksi |
|--------|------|------|
| **Connected** | Arduino aktif dan siap berkomunikasi | Tidak perlu aksi |
| **Offline** | Arduino tidak merespons | Pastikan Arduino aktif dan IP benar |
| **Unknown** | Belum pernah di-test | Klik "Test Koneksi" |

## 🔧 Troubleshooting

### Arduino Offline/Tidak Terhubung
1. Pastikan Arduino/ESP32 sudah di-program dengan sketch yang tepat
2. Periksa apakah Arduino terhubung ke Wi-Fi yang sama dengan komputer
3. Verifikasi IP address sudah benar
4. Cek firewall - pastikan port 3000 tidak diblok

### IP Berubah-ubah
Arduino mungkin mendapat IP dinamis dari router. Solusi:
1. Atur IP statis di Arduino sketch
2. Atau konfigurasi router untuk memberikan IP tetap (MAC address binding)

### Koneksi Timeout
- Arduino offline atau tidak merespons
- Pastikan Arduino sketch sudah upload dan berjalan
- Cek koneksi Wi-Fi di Arduino Serial Monitor

## 📝 Catatan Teknis

- Data konfigurasi disimpan di file: `data/arduino-config.json`
- API endpoint: `POST /api/arduino-config`
- Test koneksi menggunakan timeout 5 detik
- Config otomatis ter-load saat halaman dibuka

## 🚀 Integrasi dengan Arduino

Setelah mengatur IP Arduino, Arduino dapat berkomunikasi dengan backend di:
```
http://[IP_ARDUINO]:3000/api/attendance
```

Dengan header:
```
Content-Type: application/json
x-device-key: rahasia123
```

Contoh payload untuk check-in:
```json
{
  "action": "deviceCheckin",
  "deviceId": "ESP32-01",
  "templateId": 12
}
```

Lihat [SETUP_ESP32.md](./SETUP_ESP32.md) untuk detail lengkap integrasi Arduino.
