# Panduan Maintenance dan Pemulihan Data Absensi

Panduan ini untuk menangani error HTTP 500, memastikan mapping fingerprint tidak disalahartikan hilang, dan memulihkan data dengan aman.

## Pahami lapisan perlindungan

1. **Dashboard:** bila API gagal dimuat, dashboard menampilkan peringatan dan tidak mengganti data yang gagal dibaca dengan daftar kosong.
2. **Riwayat mapping:** perubahan ID template dicatat di tabel `fingerprint_mapping_audits` dalam transaksi database yang sama. Riwayat mencakup ID template, device ID, ID pegawai sebelum/sesudah, waktu, dan jenis perubahan. Scan absensi biasa tidak membuat baris audit.
3. **Backup mapping off-site:** perubahan pegawai/mapping menjadwalkan snapshot terenkripsi ke Google Drive, ditambah snapshot mingguan yang juga berisi log verifikasi fingerprint delapan hari terakhir. Tapping tidak mengunggah snapshot baru. Simpan kunci enkripsi secara offline agar data dapat dipulihkan.
4. **Backup operasional harian off-site:** GitHub Actions mengambil snapshot konsisten langsung dari Railway dan mengunggah arsip terenkripsi ke Google Drive. Workflow ini tidak berjalan di Vercel sehingga dapat tetap berjalan ketika deployment Vercel mengalami gangguan.
5. **Backup bawaan Railway:** aktifkan backup/PITR yang tersedia untuk plan database yang digunakan. Ini lapisan pemulihan tercepat; backup Drive adalah salinan off-site tambahan, bukan pengganti backup database.

Tidak ada mekanisme yang dapat menjamin kehilangan data nol mutlak. Jika Railway/database dan GitHub/Drive sama-sama tidak tersedia, atau data baru berubah setelah backup terakhir, perubahan terbaru mungkin belum tercakup. Backup harian memiliki target kehilangan maksimum sekitar 24 jam bila job sebelumnya sukses; Railway PITR dapat memperkecilnya sesuai konfigurasi plan. Lakukan uji restore berkala ke database kosong.

### Pengaman agar database kosong/keliru tidak dianggap normal

Production API memeriksa target database pada GET dan operasi tulis utama. Tetapkan Vercel Production Environment Variables berikut dari `DATABASE_URL` yang benar:

- `EXPECTED_DATABASE_HOST`: hanya hostname URL database, tanpa protokol atau port.
- `EXPECTED_DATABASE_PORT`: port URL; jika URL tidak mencantumkan port, gunakan `3306`.
- `EXPECTED_DATABASE_NAME`: nama database setelah slash terakhir pada path URL.

Nilai tersebut bukan kredensial; jangan salin atau membagikan username/password. Bila host, port, atau nama database pada `DATABASE_URL` berubah tanpa pembaruan pin ini, API menolak request daripada melanjutkan ke target berbeda. Jika tabel pegawai, mapping, dan absensi semuanya kosong, production API juga mengembalikan 503 dengan pesan pemeriksaan, bukan mengirim dashboard kosong. Pada pemasangan pertama yang memang belum memiliki data, set `ALLOW_EMPTY_DATABASE_INITIALIZATION=true` sementara untuk membuat data awal; setelah pegawai/mapping/absensi pertama tersedia, hapus variable itu dan redeploy. Jangan biarkan bypass ini aktif permanen.

Endpoint GET kini hanya membaca: tidak lagi mengubah catatan absensi atau menghapus log verifikasi sebagai efek samping pembacaan. Operasi penghapusan pegawai, satu catatan absensi, absensi harian/lampau, log, dan mapping memerlukan nilai konfirmasi yang sesuai di server; UI juga meminta konfirmasi untuk penghapusan yang tersedia.

### Sidik jari terdeteksi tetapi muncul “ID BELUM MAP”

Sensor fingerprint menyimpan template pada memorinya sendiri. Itu berbeda dari relasi database `fingerprint_mappings.templateId` → `employeeId`. Firmware pendaftaran mengirim ID ke server tanpa memilih pegawai, jadi hasil normalnya adalah mapping ada tetapi masih `employeeId = NULL`. Tapping tetap dikenali oleh sensor, tetapi tidak bisa dicatat sebagai absensi sampai ID dihubungkan ke pegawai.

Pada firmware `firmware/fingerprint_sensor/fingerprint_sensor.ino`, ESP32 mengirim ulang daftar ID sensor ke endpoint database setelah boot dan setiap 60 detik saat Wi-Fi tersedia. Sinkronisasi hanya menambah ID yang belum dikenal/mengisi device ID yang kosong; tidak menghapus ID yang hilang dari satu respons dan tidak mengganti pegawai pada mapping yang sudah ada. Bila ditemukan pegawai yang memiliki `pendingFingerprintId` sama persis, ID itu dipetakan otomatis dan status pending dibersihkan. Jika koneksi gagal saat pendaftaran, sinkronisasi berikutnya mencoba lagi. Ketika scan absensi menemukan ID baru yang tidak ada di database, API juga mencatat ID itu sebagai belum dipetakan dan membuat log verifikasi agar bisa ditemukan di dashboard.

Langkah operator:

1. Setelah upload firmware yang memuat sinkronisasi tersebut, tunggu status Wi-Fi tersambung dan hingga satu menit agar daftar ID ESP32 terkirim. Dari halaman Admin, tombol **Sinkronkan dari ESP32** juga dapat meminta sinkronisasi segera; ESP32 harus online.
2. Buka Admin → **Mapping template fingerprint ke pegawai**. Cari Template ID yang ditampilkan pada serial monitor atau baris log **Belum dipetakan**.
3. Pilih nama pegawai yang benar pada baris **Belum di-map**, tekan **Map**, lalu coba tapping lagi. Jangan daftarkan ulang jari yang LCD-nya menyatakan sudah terdaftar; itu berarti template sudah ada di sensor.
4. Jika ID tidak muncul, periksa Serial Monitor untuk `Template IDs synchronized to web database`, error HTTP, dan status Wi-Fi. Pastikan firmware terbaru ter-upload, `DEVICE_KEY` sama dengan secret server, serta Vercel Production mengarah ke database yang dipakai aplikasi. Jangan reset sensor atau hapus mapping untuk memperbaiki kasus ini.

## Rutinitas pencegahan

### Backup operasional harian independen dari Vercel

Workflow `.github/workflows/operational-database-backup.yml` berjalan setiap hari pukul 14.00 UTC (22.00 WITA) dan dapat dijalankan manual dari GitHub Actions. Ia membaca database dengan transaksi konsisten, membuat arsip JSON, mengenkripsinya dengan AES-256-GCM di memori, mengunggah lalu mengunduh kembali dan memverifikasi arsip tersebut sebelum menghapus backup operasional yang lebih lama dari 365 hari. Jika sumber kosong total, mapping menunjuk ke pegawai yang tidak ada, upload/verifikasi gagal, backup lama tidak akan dihapus. Data tidak disimpan sebagai artifact atau file lokal yang persisten di runner.

Tabel yang dicadangkan: `employees`, `attendance_records`, `fingerprint_mappings` (tanpa field `templateData`), `fingerprint_mapping_audits`, `fingerprint_verification_logs`, dan `device_commands`. Tidak dicadangkan: field template biometrik sensor, `webauthn_credentials`/public key, skema database, atau file konfigurasi. Jalankan migrasi pada database target sebelum pemulihan. Script pemulihan memastikan seluruh tabel aplikasi pada target kosong (metadata `_prisma_migrations` boleh berisi riwayat migrasi), dan menolak target jika ada tabel wajib yang belum tersedia.

Sebelum mengaktifkan workflow:

1. Di Railway, siapkan **public TCP proxy/connection URL** untuk MySQL. Jangan pakai hostname internal `*.railway.internal` karena runner GitHub Actions berada di luar jaringan Railway. Tambahkan query `ssl=true` pada URL (atau `&ssl=true` jika query lain sudah ada); skrip menolak koneksi tanpa TLS dan memverifikasi sertifikat. Pastikan service database mendukung sertifikat TLS yang valid. Railway mengenakan biaya network egress untuk akses melalui TCP Proxy; tinjau harga dan estimasi pemakaian sebelum mengaktifkannya. Jangan menonaktifkan verifikasi sertifikat hanya untuk memaksa koneksi berhasil.
2. Buat user database khusus backup dengan izin `SELECT` saja pada tabel yang dicadangkan. Simpan connection URL-nya sebagai GitHub repository secret `BACKUP_DATABASE_URL`; jangan masukkan ke repository atau log.
3. Tambahkan **Repository Variables** (bukan secrets) sebagai pin sumber yang diharapkan:
   - `BACKUP_EXPECTED_DATABASE_HOST`: hostname Railway TCP proxy.
   - `BACKUP_EXPECTED_DATABASE_PORT`: port proxy Railway.
   - `BACKUP_EXPECTED_DATABASE_NAME`: nama schema database MySQL.

   Ketiganya harus cocok tepat dengan `BACKUP_DATABASE_URL`. Jika URL mengarah ke database lain, workflow berhenti sebelum snapshot dibuat. Jangan pernah memasukkan password/username database ke variables ini.
4. Konfigurasikan ulang OAuth Google Drive setelah credential lama diganti/dicabut. Gunakan scope `https://www.googleapis.com/auth/drive.file` dan akun Drive pemilik backup. Simpan client ID, client secret, dan refresh token sebagai GitHub repository secrets bernama `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, dan `GOOGLE_DRIVE_REFRESH_TOKEN`.
5. Buat kunci Base64 acak 32 byte yang sama untuk proses backup dan restore. Simpan sebagai secret `BACKUP_ENCRYPTION_KEY` di GitHub, dan salinan pemulihan dalam password manager/offline. Jangan mengambil kunci dari output, log, atau repository. Jika kunci hilang, arsip tidak dapat didekripsi.
6. Jangan masukkan refresh token atau encryption key ke file `.env`, editor, atau commit. Batasi akses repository dan secrets ke maintainer yang perlu.
7. Setelah secrets dan variables ditambahkan, jalankan workflow **Daily encrypted operational database backup** secara manual. Pastikan run sukses, file terenkripsi terlihat di Drive, dan catat file ID serta waktu backup dari log GitHub Actions. Jangan anggap backup aktif sebelum uji ini lolos.
8. Atur notifikasi GitHub Actions untuk kegagalan workflow dan periksa status job setiap hari. Jika job gagal, perbaiki sebabnya dan jalankan ulang segera; jadwal berikutnya tidak mengisi otomatis backup yang terlewat.

Untuk uji restore, siapkan database MySQL **baru dan kosong** yang dapat diakses dari GitHub runner, jalankan migrasi aplikasi di sana, dan berikan URL dengan `ssl=true` sebagai GitHub Actions secret `RESTORE_DATABASE_URL`. Konfigurasikan GitHub Environment `data-restore` dengan required reviewer agar workflow pemulihan perlu persetujuan operator. Jalankan **Restore encrypted operational database backup** dengan ID backup yang telah dipilih. Skrip mengunduh dan mendekripsi backup di memori, menolak pemulihan jika database target sama dengan sumber atau jika tabel data operasional maupun `webauthn_credentials` pada target berisi data, dan memasukkan data dalam transaksi. Jangan arahkan `RESTORE_DATABASE_URL` ke database produksi aktif. Setelah pemulihan, verifikasi jumlah pegawai, absensi, mapping, audit, log verifikasi dan perintah; template biometrik dan kredensial WebAuthn memang tidak ikut dipulihkan.

Pemulihan ke Railway database baru dan perpindahan `DATABASE_URL` pada Vercel adalah tindakan manual; jangan mengarahkan aplikasi produksi ke target sebelum hasil restore diverifikasi. Workflow restore hanya mengembalikan data, bukan kode, schema migration, konfigurasi ESP32, secret, atau template sidik jari di sensor.

Railway mendokumentasikan backup database dan point-in-time recovery (PITR) hingga tujuh hari untuk MySQL. Ketersediaan, pengaturan, dan biaya bergantung pada layanan/plan yang aktif. Periksa tab **Backups** serta harga Railway terlebih dahulu; jangan mengaktifkan upgrade atau fitur berbayar tanpa persetujuan. Lihat [dokumentasi MySQL Railway](https://docs.railway.com/databases/mysql), [backup volume](https://docs.railway.com/volumes/backups), dan [PITR](https://docs.railway.com/volumes/point-in-time-recovery).

### Mengaktifkan backup mingguan terenkripsi ke Google Drive

Backup mapping dijalankan setelah perubahan mapping/pegawai melalui API. Backup mingguan menyimpan kondisi pegawai dan mapping saat itu serta log verifikasi fingerprint selama delapan hari terakhir; satu hari overlap menjaga agar tidak ada celah jika jadwal Cron terlambat. Log absensi/rekap, WebAuthn, dan biometrik ESP32 tidak disimpan. Tapping biasa tidak memicu backup baru. Snapshot yang dienkripsi dengan AES-256-GCM sebelum upload disimpan di Google Drive dan dipertahankan maksimal 365 hari.

1. Di Google Cloud Console, buat project dan aktifkan **Google Drive API**.
2. Konfigurasikan OAuth consent screen dan tambahkan akun Google pemilik Drive sebagai test user jika aplikasi masih berstatus Testing.
3. Buat OAuth Client ID tipe Web application dan tambahkan Authorized redirect URI `https://developers.google.com/oauthplayground`. Di OAuth 2.0 Playground, buka pengaturan (ikon roda gigi), centang **Use your own OAuth credentials**, masukkan Client ID/Secret, dan gunakan scope `https://www.googleapis.com/auth/drive.file`.
4. Di OAuth Playground, otorisasi scope tadi dengan akun Google yang akan menerima backup, lalu tukarkan authorization code. Simpan `refresh_token` dari respons sebagai secret. Jangan bagikan nilai ini. Aplikasi hanya membuat/membaca file backup yang dibuatnya sendiri menggunakan scope `drive.file`. Untuk menghindari refresh token kedaluwarsa setelah masa uji, ubah publishing status OAuth consent ke **In production** setelah konfigurasi selesai.
5. Buat nilai acak berikut secara lokal; jangan kirim hasilnya di chat:
   ```powershell
   node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64') + '\n')"
   ```
   Jalankan terpisah untuk `BACKUP_ENCRYPTION_KEY`, `CRON_SECRET`, dan `BACKUP_RESTORE_SECRET`; ketiganya harus berbeda. Simpan salinan `BACKUP_ENCRYPTION_KEY` di password manager/offline—kehilangan key membuat backup tidak bisa didekripsi.
6. Di Vercel → project `absensi-online` → **Settings → Environment Variables**, tambahkan untuk Production:
   - `GOOGLE_DRIVE_CLIENT_ID`
   - `GOOGLE_DRIVE_CLIENT_SECRET`
   - `GOOGLE_DRIVE_REFRESH_TOKEN`
   - `BACKUP_ENCRYPTION_KEY`
   - `CRON_SECRET`
   - `BACKUP_RESTORE_SECRET`
7. Deploy aplikasi. Job Cron pada `vercel.json` berjalan setiap Minggu pukul 10.00 UTC (18.00 WITA); pemanggilan dapat bergeser sesuai ketentuan plan Vercel. Perubahan mapping membuat snapshot tambahan saat itu juga. Jika database tidak memiliki mapping, backup kosong ditolak dan snapshot sebelumnya tetap ada.
8. Periksa Vercel → **Settings → Cron Jobs** dan Function Logs untuk memastikan job aktif dan berhasil. Uji koneksi menggunakan request di bawah. Pastikan file backup tercantum dari endpoint admin sebelum menganggap konfigurasi selesai.

Google Drive personal memberi 15 GB yang dipakai bersama Drive, Gmail, dan Photos; jika ruang bersama habis, backup dapat gagal. Periksa kapasitas dan retensi akun secara berkala. Snapshot dengan usia lebih dari 365 hari dihapus oleh job mingguan. Informasi kuota tersedia di [Google Account storage](https://support.google.com/drive/answer/6374270). Cron Vercel tersedia di semua plan, tetapi perhatikan batas jadwal sesuai [pricing Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Uji job tanpa menunggu hari Minggu; masukkan `CRON_SECRET` secara tersembunyi:

```powershell
$secure = Read-Host "CRON_SECRET" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  Invoke-RestMethod -Uri "https://absensi-online-delta.vercel.app/api/cron/fingerprint-mapping-backup" -Headers @{ Authorization = "Bearer $token" }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable token -ErrorAction SilentlyContinue
}
```

HTTP 409 dengan pesan bahwa mapping kosong berarti backup sengaja dilewati; snapshot Drive yang lama tetap tersedia.

### Memeriksa dan memulihkan dari backup Google Drive

Endpoint admin memerlukan `BACKUP_RESTORE_SECRET` melalui HTTPS. Jangan menaruh secret literal dalam perintah atau riwayat terminal; PowerShell berikut meminta secret tanpa menampilkannya:

```powershell
$secure = Read-Host "BACKUP_RESTORE_SECRET" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $headers = @{ Authorization = "Bearer $token" }
  $backups = Invoke-RestMethod -Uri "https://absensi-online-delta.vercel.app/api/admin/fingerprint-backup" -Headers $headers
  $backups.backups | Format-Table createdAt, kind, bytes, id
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable token, headers -ErrorAction SilentlyContinue
}
```

Untuk memulihkan, pilih `id` backup yang benar dari daftar, lalu jalankan preview terlebih dahulu. Snapshot hanya boleh dipulihkan ke database asalnya; endpoint menolak target database yang berbeda. Pemulihan hanya menambahkan pegawai/mapping yang hilang atau menghubungkan mapping yang masih belum bertuan. Ia tidak menghapus atau menimpa mapping aktif. Konflik ID/email/template membatalkan transaksi. Snapshot mingguan juga menambahkan log verifikasi yang belum tercatat, tanpa menghapus log saat ini.

```powershell
$secure = Read-Host "BACKUP_RESTORE_SECRET" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $headers = @{ Authorization = "Bearer $token" }
  $backupId = Read-Host "Tempel ID backup yang dipilih dari daftar"
  $body = @{ key = $backupId } | ConvertTo-Json
  $preview = Invoke-RestMethod -Uri "https://absensi-online-delta.vercel.app/api/admin/fingerprint-backup" -Method Post -Headers $headers -ContentType "application/json" -Body $body
  $preview | ConvertTo-Json -Depth 5
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable token, headers -ErrorAction SilentlyContinue
}
```

Periksa target database dan jumlah data pada hasil preview. Jika sesuai dan migration `fingerprint_mapping_audits` sudah diterapkan, jalankan ulang request POST dengan body yang sama ditambah `confirm = "RESTORE-FINGERPRINT-MAPPINGS"`. Pemulihan mencatat perubahan mapping dengan audit. Jika migration audit belum diterapkan, jangan mencoba menghapus pemeriksaan audit; terapkan migration dengan prosedur pada bagian berikut terlebih dahulu.

Jika database diganti ke instance baru saat pemulihan bencana, preview awal akan menolak karena asal database berbeda. Setelah memastikan instance baru memiliki schema aplikasi dan migration audit, jalankan preview dengan body `{ key = $backupId; allowDifferentDatabase = $true }`. Periksa dengan teliti `databaseSource` dan `databaseTarget`; untuk menerapkan hanya setelah cocok, kirim body yang sama dengan `confirm = "RESTORE-FINGERPRINT-MAPPINGS-TO-NEW-DATABASE"`. Ini adalah override eksplisit; jangan gunakan untuk database production yang salah.

Untuk menerapkan setelah preview diverifikasi, minta secret lagi dan kirim konfirmasi eksplisit:

```powershell
$secure = Read-Host "BACKUP_RESTORE_SECRET" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $headers = @{ Authorization = "Bearer $token" }
  $backupId = Read-Host "Tempel kembali ID backup yang sudah diperiksa"
  $body = @{ key = $backupId; confirm = "RESTORE-FINGERPRINT-MAPPINGS" } | ConvertTo-Json
  Invoke-RestMethod -Uri "https://absensi-online-delta.vercel.app/api/admin/fingerprint-backup" -Method Post -Headers $headers -ContentType "application/json" -Body $body
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable token, headers -ErrorAction SilentlyContinue
}
```

Setelah pemulihan, verifikasi mapping pada Admin dan sensor. Backup tidak berisi biometrik sidik jari di ESP32. Jika database Production benar-benar hilang, buat database dengan schema aplikasi dan pastikan koneksi Vercel mengarah ke database yang benar sebelum memulihkan. Jangan mengarahkan aplikasi langsung ke database baru atau menjalankan reset saat masih menyelidiki insiden.

### Setelah menerapkan kode audit ke production

1. Buat snapshot/backup database melalui penyedia database.
2. Pastikan `DATABASE_URL` production tersedia di terminal lokal dengan aman. Jangan menempelkan URL atau password database ke chat, tiket, atau log.
3. Dari PowerShell, masuk ke folder proyek:
   ```powershell
   cd D:\Absensi\absensi
   ```
4. Terapkan migration audit satu kali:
   ```powershell
   npm.cmd run db:deploy
   ```
5. Pastikan perintah selesai tanpa error. Migration membuat tabel audit dan mencatat baseline mapping yang sudah tersimpan pada waktu migration. Jangan jalankan `prisma migrate reset`.
6. Deploy kode aplikasi ke Vercel sesudah migration berhasil. Jika migration gagal, jangan lanjutkan deploy; periksa koneksi dan log database.

### Backup database terjadwal

Catatan proyek saat ini mengarah ke MySQL di Railway. Pastikan nama layanan database di Railway cocok dengan `DATABASE_URL` Production Vercel; jangan membuat backup hanya untuk layanan aplikasi Next.js.

1. Masuk ke Railway, buka project dan environment **Production**.
2. Pilih service MySQL yang dipakai aplikasi. Pastikan service memiliki volume yang terpasang dan volume tersebut menyimpan data MySQL.
3. Buka **Settings → Backups** pada service database.
4. Aktifkan jadwal **Daily**. Railway menyimpan backup harian selama 6 hari.
5. Untuk masa simpan lebih panjang, aktifkan juga **Weekly** (disimpan 27 hari) dan/atau **Monthly** (disimpan 89 hari). Beberapa jadwal dapat aktif bersamaan. Periksa harga penyimpanan incremental pada plan Railway Anda.
6. Sebelum menjalankan migration atau maintenance berisiko, buat backup manual dari tab Backups.
7. Kembali ke daftar backup dan pastikan backup terbaru selesai/terlihat. Jangan menganggap jadwal aktif sebelum ada backup yang berhasil.
8. Catat waktu backup terakhir yang berhasil dan siapa yang berwenang melakukan restore.

**Uji pemulihan dengan hati-hati:** pilih backup hanya setelah memastikan tanggalnya. Railway menyiapkan pemulihan sebagai staged change dengan volume baru yang terpasang ke service. Periksa detail staged change sebelum menekan **Deploy**. Volume lama akan dilepas dari service tetapi dipertahankan di project; jangan hapus sebelum data hasil pemulihan diverifikasi. Penghapusan volume menghapus backup-nya.

Jika provider database ternyata bukan Railway, jangan ikuti nama menu di atas: cari pengaturan automatic backup/snapshot pada provider aktual dan pastikan backup mencakup volume database Production.

## Saat dashboard menampilkan HTTP 500 atau mapping tampak kosong

1. **Jangan** menjalankan penghapusan, reset database, `prisma migrate reset`, skrip penghapusan fingerprint, atau membuat database baru.
2. Muat ulang halaman sekali setelah koneksi pulih. Peringatan gagal memuat berarti data belum bisa dibaca, bukan bukti bahwa baris database sudah terhapus.
3. Periksa API baca-saja:
   ```powershell
   Invoke-WebRequest https://absensi-online-delta.vercel.app/api/attendance -TimeoutSec 20
   ```
   - `200`: database berhasil dibaca saat pemeriksaan. Jangan menampilkan isi response ke log publik karena dapat berisi data pegawai.
   - `500` atau gagal tersambung: lanjutkan pemeriksaan; jangan jalankan tindakan tulis.
4. Buka **Vercel → Project → Deployments → deployment aktif → Functions/Logs**. Periksa error pada `/api/attendance` dan waktu kejadian. Simpan kode error dan waktu, tetapi jangan salin kredensial atau isi data pribadi.
5. Periksa **Project Settings → Environment Variables**:
   - `DATABASE_URL` production terisi dan menunjuk database production yang benar.
   - Variabel berlaku untuk environment **Production**.
   - Jika baru diubah, buat deployment baru.
6. Periksa dashboard penyedia database: status layanan, koneksi, batas kuota/koneksi, dan apakah database/schema masih tersedia.
7. Jika database sehat tetapi mapping tidak cocok, gunakan langkah audit di bawah. Jika database hilang/rusak, pulihkan snapshot database ke instance staging terlebih dahulu, lalu verifikasi tabel `employees`, `fingerprint_mappings`, `fingerprint_mapping_audits`, dan data absensi sebelum mengganti koneksi production.

Jangan menyimpulkan kehilangan data hanya dari pesan browser “HTTP ERROR” atau “500”. Error bisa berasal dari koneksi, konfigurasi environment, atau schema yang belum dimigrasikan.

## Memeriksa dan memulihkan mapping dari riwayat audit

Pastikan migration audit sudah diterapkan dan koneksi mengarah ke database yang ingin diperiksa. Perintah pertama hanya menghitung mapping yang bisa dipulihkan; tidak mengubah database:

```powershell
cd D:\Absensi\absensi
node --env-file=.env.local --env-file=.env scripts/maintenance/restore-fingerprint-mappings.js --from-audit
```

Periksa jumlahnya dan cocokkan dengan daftar pegawai/template yang diharapkan. Jika jumlah dan database sudah dipastikan benar, jalankan pemulihan eksplisit:

```powershell
node --env-file=.env.local --env-file=.env scripts/maintenance/restore-fingerprint-mappings.js --from-audit --confirm=RESTORE-FINGERPRINT-MAPPINGS
```

Skrip menolak pemulihan bila ID pegawai tidak ada atau ada mapping yang sudah terhubung ke pegawai berbeda. Jangan menghapus mapping yang berkonflik untuk memaksa pemulihan; pulihkan/benahi data pegawai melalui backup database terlebih dahulu.

Untuk backup off-site dan pemulihan melalui Google Drive, ikuti langkah pada bagian **Mengaktifkan backup mingguan terenkripsi ke Google Drive**. Backup tidak disimpan di mesin lokal. Pemulihan audit hanya tersedia jika database dan tabel audit masih dapat dibaca.

## Perubahan yang tidak boleh dilakukan saat insiden

- Jangan gunakan `prisma migrate reset` pada database berisi data.
- Jangan menghapus atau membuat ulang database sebelum memastikan backup, target koneksi, dan persetujuan pemulihan.
- Jangan menjalankan `scripts/maintenance/clear-all-fingerprints.js --confirm=DELETE-ALL-FINGERPRINTS` sebagai langkah memperbaiki HTTP 500. Flag tersebut memang menghapus template sensor dan mapping database.
- Jangan menghapus tabel `fingerprint_mapping_audits`; tabel tersebut adalah riwayat pemulihan mapping.
- Jangan menganggap ID hilang dari layar sebagai data terhapus sebelum API/database diperiksa.
- Jangan menaruh `DATABASE_URL`, API key, atau data pegawai pada repository, screenshot publik, atau log terbuka.

## Kontak dan catatan insiden

Sebelum meminta bantuan, siapkan:

- waktu error beserta zona waktu;
- URL halaman/API dan status HTTP;
- deployment Vercel yang aktif;
- kode error database dari Function Logs;
- waktu backup database terakhir yang berhasil;
- jumlah mapping yang diharapkan dan hasil pemeriksaan mode baca-saja.

Jangan sertakan password, connection string, API key, sidik jari, atau daftar nama pegawai pada laporan.
