# 📝 Panduan Update Konfigurasi Serial Port & Baud Rate

Dokumentasi lengkap untuk mengupdate konfigurasi AS608 Fingerprint Scanner di UI Settings.

---

## 🎯 Tujuan Update

Mengubah Serial Port dan Baud Rate untuk:
- ✅ Memperbaiki "Connection Failed"
- ✅ Menyesuaikan dengan port Arduino yang benar
- ✅ Mempercepat atau memperlambat komunikasi serial

---

## 📍 Lokasi Form

**URL**: `http://localhost:3000/admin/settings`

Bagian: **"Konfigurasi Arduino Serial"** (sebelum Konfigurasi Website Target)

---

## 🔧 Cara Update - Step by Step

### **Langkah 1: Buka Halaman Settings**

```
1. Buka browser
2. Ketik URL: http://localhost:3000/admin/settings
3. Halaman settings akan muncul
```

---

### **Langkah 2: Lihat Form "Konfigurasi Arduino Serial"

Anda akan melihat form dengan field berikut:

```
┌─────────────────────────────────────────┐
│ 🟡 Status: Connection Failed             │
│    Terakhir cek: 18/8/2026, 08.43.41    │
└─────────────────────────────────────────┘

Serial Port (COM7, /dev/ttyUSB0, etc)
[_______________]  ← INPUT FIELD 1

Baud Rate
[115200          ▼]  ← DROPDOWN FIELD 2

Nama Device
[Arduino Fingerprint] ← INPUT FIELD 3

[🔗 Test Koneksi]  [💾 Simpan Konfigurasi]
```

---

### **Langkah 3A: Update Serial Port**

**Jika Arduino terhubung ke COM port yang berbeda:**

1. **Klik** pada input field Serial Port (field yang berisi "COM7")
2. **Hapus** teks lama:
   - Triple-click untuk select all
   - Atau Ctrl+A untuk select semua
   - Press Delete/Backspace
3. **Ketik** COM port yang benar:
   - Contoh: `COM3`
   - Contoh: `COM5`
   - Contoh: `/dev/ttyUSB0` (di Linux)

**Contoh input:**
```
COM7 → Ubah ke → COM5
```

---

### **Langkah 3B: Update Baud Rate (Jika Perlu)**

**Jika Arduino menggunakan baud rate yang berbeda:**

1. **Klik** pada dropdown Baud Rate
2. **Pilih** salah satu opsi:
   - 9600
   - 14400
   - 19200
   - 38400
   - 57600
   - **115200** ← (standar, paling umum)

**Catatan**: Jika tidak tahu, gunakan **115200** terlebih dahulu

---

### **Langkah 3C: Update Nama Device (Opsional)**

**Untuk identifikasi perangkat:**

1. **Klik** pada input field Nama Device
2. **Hapus** teks lama
3. **Ketik** nama deskriptif:
   - Contoh: `Arduino Fingerprint`
   - Contoh: `AS608 Scanner`
   - Contoh: `Sensor Sidik Jari`

---

### **Langkah 4: Test Koneksi**

**Setelah update konfigurasi:**

1. **Klik tombol** 🔗 **Test Koneksi**
2. **Tunggu** beberapa detik sampai selesai
3. **Lihat hasil**:

   **✅ BERHASIL:**
   ```
   ✅ Connected - Port terhubung dengan baik
   Status: Connected (hijau)
   ```

   **❌ GAGAL:**
   ```
   ❌ Connection Failed
   Status: Connection Failed (merah)
   → Kembali ke Langkah 1, cek COM port lagi
   ```

---

### **Langkah 5: Simpan Konfigurasi**

**Jika test berhasil:**

1. **Klik tombol** 💾 **Simpan Konfigurasi**
2. **Tunggu** sampai selesai
3. **Lihat pesan sukses**:
   ```
   ✅ Konfigurasi disimpan. Status: Connected
   ```

---

## 🔍 Cara Menemukan COM Port yang Benar

### **Metode 1: Device Manager (Windows)**

1. Tekan **Win + X**
2. Pilih **Device Manager**
3. Cari section **"Ports (COM & LPT)"**
4. Lihat port yang tersedia:
   ```
   ▶ Ports (COM & LPT)
     └─ Silicon Labs CP210x USB to UART Bridge (COM7)
     └─ CH340 (COM5)
   ```
5. Catat nomor COM (contoh: COM7, COM5)

### **Metode 2: Arduino IDE Serial Monitor**

1. Buka **Arduino IDE**
2. **Tools → Serial Monitor** (atau Ctrl+Shift+M)
3. **Tools → Port** → Lihat port mana yang tersedia
4. Biasanya ada label chip-nya:
   ```
   /dev/cu.usbserial-1420 (CH340)
   COM7 (Silicon Labs)
   ```

### **Metode 3: PowerShell (Windows)**

```powershell
# Buka PowerShell, jalankan:
Get-WmiObject Win32_SerialPort | Select-Object Name, Description

# Output:
# Name                                          Description
# ----                                          -----------
# Silicon Labs CP210x USB to UART Bridge (COM7) Silicon Labs CP210x...
```

---

## 📊 Tabel Baud Rate Umum

| Baud Rate | Kecepatan | Jarak Maksimal | Penggunaan Umum |
|-----------|-----------|---|---|
| 9600 | Lambat | ~15m | Legacy/Old devices |
| 19200 | Sedang | ~10m | Beberapa devices |
| 57600 | Cepat | ~5m | Arduino modernS |
| **115200** | **Sangat Cepat** | **~3m** | **Standard (Recommended)** |

**Rekomendasi**: Gunakan **115200** untuk AS608 + Arduino modern

---

## 🆘 Troubleshooting Common Issues

### ❌ Masalah: Port tidak muncul di Device Manager

**Solusi:**
1. Pastikan Arduino terpasang via USB
2. Coba USB port yang berbeda
3. Restart komputer
4. Update driver:
   - CH340: https://www.wch.cn/downloads/CH341SER_EXE.html
   - FTDI: https://ftdichip.com/drivers/

### ❌ Masalah: Test Koneksi tetap Failed

**Solusi:**
1. Cek COM port di Device Manager (apakah masih ada?)
2. Tutup program lain yang menggunakan COM port:
   - Serial Monitor Arduino IDE
   - Putty
   - Hyperterminal
3. Coba baud rate berbeda (9600, 57600)
4. Restart komputer & Arduino

### ❌ Masalah: Muncul error "Port sedang digunakan"

**Solusi:**
```powershell
# Tutup program yang menggunakan port
# Di PowerShell:
Get-Process | where {$_.handles -gt 1000} | stop-process

# Atau restart komputer
Restart-Computer
```

### ❌ Masalah: Gibberish di Serial Monitor

**Solusi:**
- Baud rate tidak sesuai
- Coba baud rate berbeda (9600, 19200, 57600, 115200)
- Lihat output Arduino untuk tahu baud rate yang benar

---

## ✅ Checklist Update Berhasil

- [ ] COM port sudah update ke port yang benar
- [ ] Baud rate diatur ke 115200 (atau sesuai Arduino)
- [ ] Test Koneksi menunjukkan **Connected** ✅
- [ ] Status card menunjukkan **Status: Connected** (hijau)
- [ ] Tombol **Simpan Konfigurasi** diklik
- [ ] Pesan sukses muncul

---

## 🚀 Next Steps Setelah Update Berhasil

Setelah koneksi berhasil:

1. **Konfigurasi Website Target** (bagian selanjutnya di halaman)
   - Input URL website yang akan menerima data
   - (Opsional) Input API Key
   - Centang "Auto forward data"
   - Test koneksi ke website
   - Simpan

2. **Test Scan Fingerprint**
   - Buka halaman: `http://localhost:3000/scan-fingerprint`
   - Klik tombol "🔘 Scan Fingerprint"
   - Lihat apakah scan berhasil

3. **Verifikasi Data Forward**
   - Jika autoForwardData enabled, data akan dikirim ke website target
   - Cek logs di server untuk verifikasi

---

## 📞 Need Help?

Jika masih ada masalah:

1. Screenshot halaman settings (tampilkan status)
2. Buka Device Manager, lihat COM port apa yang ada
3. Test di Arduino IDE Serial Monitor
4. Cek baud rate mana yang bekerja
5. Report issue dengan detail tersebut

Semoga berhasil! 🎉
