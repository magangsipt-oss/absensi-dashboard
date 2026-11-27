# Telegram Bot Absensi

Bot ini membaca database absensi dan memeriksa status ESP32 fingerprint.

## 1. Buat bot Telegram

1. Buka Telegram dan cari `@BotFather`.
2. Kirim `/newbot`.
3. Simpan token bot yang diberikan. Jangan masukkan token ke source code atau commit Git.

## 2. Ambil chat ID

1. Jalankan bot sementara dengan `TELEGRAM_ALLOWED_CHAT_ID=0` tidak disarankan untuk produksi.
2. Cara sederhana: kirim pesan ke bot, lalu buka:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Ambil nilai `message.chat.id` dari respons JSON.

## 3. Jalankan bot di PowerShell

Dari folder `d:\Absensi\absensi`:

```powershell
$env:TELEGRAM_BOT_TOKEN="TOKEN_DARI_BOTFATHER"
npm.cmd run telegram:bot
```

Atau simpan `TELEGRAM_BOT_TOKEN` di `.env.local`; script npm akan memuatnya otomatis. Bot menerima pesan dari semua Chat ID Telegram.

Biarkan terminal bot tetap berjalan. Server Next.js tetap dijalankan di terminal lain dengan `npm.cmd run dev`.

## Alur pendaftaran

1. Daftarkan jari di alat fingerprint.
2. Setelah berhasil, Serial Monitor menampilkan ID dan pesan untuk menghubungi `@absensi_scan_bot`.
3. Kirim `/daftar` ke bot.
4. Kirim Fingerprint ID, nama, email, dan departemen sesuai pertanyaan bot.
5. Data karyawan dan mapping fingerprint tersimpan di database web localhost.
