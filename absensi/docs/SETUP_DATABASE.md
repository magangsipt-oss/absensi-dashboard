# Setup Database MySQL untuk Sistem Absensi

## Error yang Muncul
Jika Anda melihat error: **"Database connection failed. Please ensure database is set up."** atau **"Unexpected end of JSON input"**, berarti database belum dikonfigurasi. Ikuti langkah-langkah di bawah ini.

---

## Prasyarat
1. **MySQL Server** sudah terinstall dan berjalan
   - Jika belum: Install XAMPP atau MySQL Community Server
   - Port default: `3306`

2. **Node.js dan npm** sudah terinstall
   - Verifikasi: `npm --version`

3. **File `.env.local`** sudah ada di folder `d:\Absensi\absensi\`

---

## Langkah 1: Konfigurasi Database di `.env.local`

Buka file `d:\Absensi\absensi\.env.local` dan sesuaikan dengan setup MySQL Anda.

### Contoh untuk XAMPP (default):
```
DATABASE_URL="mysql://root@localhost:3306/absensi_db"
```

### Contoh untuk MySQL dengan password:
```
DATABASE_URL="mysql://root:password_anda@localhost:3306/absensi_db"
```

### Contoh untuk MySQL di server lain:
```
DATABASE_URL="mysql://username:password@server_address:3306/absensi_db"
```

### Contoh untuk MySQL di cloud (PlanetScale, Render, dll):
```
DATABASE_URL="mysql://user:password@host.mysql.database.azure.com:3306/dbname"
```

---

## Langkah 2: Buka Terminal di Folder Proyek

Buka **Command Prompt** atau **PowerShell**, lalu navigasi ke folder proyek:

```bash
cd d:\Absensi\absensi
```

Atau buka terminal langsung dari VS Code dengan menekan `Ctrl + `` (backtick).

---

## Langkah 3: Buat Database di MySQL

Jalankan MySQL Command Line atau MySQL Workbench, kemudian jalankan perintah ini:

```sql
CREATE DATABASE absensi_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**Verifikasi**: Lihat daftar database:
```sql
SHOW DATABASES;
```

Anda seharusnya melihat `absensi_db` dalam daftar.

---

## Langkah 4: Jalankan Prisma Migration

Di terminal (di folder proyek), jalankan:

```bash
npx prisma migrate dev --name init
```

**Apa yang terjadi:**
- Prisma akan membaca schema dari `prisma/schema.prisma`
- Membuat file migration di folder `prisma/migrations/`
- Menjalankan migration di database MySQL
- Membuat tabel `employees` dan `attendance_records`

**Output yang diharapkan:**
```
✔ Generated Prisma Client (v5.22.0)
✔ Created migration: 20260811XXXXXX_init
✔ Applied 1 migration(s)
```

---

## Langkah 5: Verifikasi Database

### Opsi A: Gunakan Prisma Studio (GUI)
```bash
npx prisma studio
```
Ini akan membuka browser di `http://localhost:5555` dengan UI untuk lihat dan edit data.

### Opsi B: Lihat tabel di MySQL Workbench
```sql
USE absensi_db;
SHOW TABLES;
DESC employees;
DESC attendance_records;
```

---

## Langkah 6: Jalankan Aplikasi

Di terminal, jalankan:

```bash
npm run dev
```

**Output yang diharapkan:**
```
  ▲ Next.js 16.3.0
  - Local:        http://localhost:3000
  - Environments: .env.local
```

Buka browser ke `http://localhost:3000`

---

## Troubleshooting

### Error: "Can't reach database server at `localhost:3306`"

**Penyebab:** MySQL tidak berjalan atau tidak dapat terhubung

**Solusi:**
1. Pastikan MySQL Server sudah berjalan:
   - **XAMPP**: Buka XAMPP Control Panel, klik "Start" pada MySQL
   - **MySQL Community**: Buka Services (ketik `services.msc`), cari "MySQL", pastikan status "Running"

2. Verifikasi port dengan menjalankan:
   ```bash
   netstat -ano | findstr :3306
   ```

3. Test koneksi dengan mysql-cli:
   ```bash
   mysql -u root
   ```

### Error: "Unknown database 'absensi_db'"

**Penyebab:** Database belum dibuat

**Solusi:** Jalankan ulang di MySQL:
```sql
CREATE DATABASE absensi_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Error: "Unknown user/password"

**Penyebab:** Kredensial di `.env.local` tidak sesuai dengan MySQL

**Solusi:**
1. Verifikasi username dan password di MySQL
2. Update `.env.local` dengan kredensial yang benar
3. Restart dev server: `npm run dev`

### Error: "Table 'absensi_db.employees' doesn't exist"

**Penyebab:** Prisma migration belum dijalankan

**Solusi:** Jalankan:
```bash
npx prisma migrate dev --name init
```

### Jika database sudah ada dan ingin reset

```bash
npx prisma migrate reset
```

> **Peringatan:** Ini akan menghapus semua data!

---

## Data Awal (Opsional)

Jika ingin membuat data awal untuk testing, gunakan Prisma Studio atau jalankan SQL:

```sql
USE absensi_db;

INSERT INTO employees (name, email, department, createdAt, updatedAt) VALUES
('Andi Pratama', 'andi@example.com', 'IT', NOW(), NOW()),
('Budi Santoso', 'budi@example.com', 'HR', NOW(), NOW()),
('Citra Dewi', 'citra@example.com', 'Finance', NOW(), NOW());

INSERT INTO attendance_records (name, time, status, note, checkedAt, createdAt) VALUES
('Andi Pratama', '08:30', 'Hadir', 'Masuk normal', NOW(), NOW()),
('Budi Santoso', '08:15', 'Hadir', 'Masuk lebih awal', NOW(), NOW()),
('Citra Dewi', '08:45', 'Terlambat', 'Lalu lintas', NOW(), NOW());
```

---

## Fitur Siap Pakai Setelah Setup

✅ **Dashboard Utama** (`http://localhost:3000`)
- Input absensi manual
- Check-in/Check-out button
- Summary statistik (Hadir/Izin/Alpha)
- Daftar absensi 5 terbaru

✅ **Admin Dashboard** (`http://localhost:3000/admin`)
- Lihat semua record absensi
- Filter berdasarkan status
- Export ke CSV
- Hapus record dengan konfirmasi
- Daftar pegawai

✅ **Semua data tersimpan di MySQL** (persistent)

---

## Referensi Perintah Penting

| Perintah | Fungsi |
|----------|--------|
| `npx prisma migrate dev --name init` | Jalankan migration pertama kali |
| `npx prisma migrate dev --name <nama>` | Buat dan jalankan migration baru |
| `npx prisma migrate reset` | Reset database (hapus semua data) |
| `npx prisma studio` | Buka GUI untuk lihat/edit data |
| `npx prisma generate` | Generate ulang Prisma Client |
| `npm run dev` | Jalankan dev server |
| `npm run build` | Build untuk production |

---

## Support

Jika masih ada error setelah ikuti langkah-langkah di atas:

1. **Baca console error** dengan teliti
2. **Copy error message** ke Browser DevTools (F12 → Console)
3. **Check .env.local** - pastikan DATABASE_URL sudah benar
4. **Restart dev server** - berhenti (`Ctrl+C`) dan jalankan ulang (`npm run dev`)

---

Selamat! Database Anda sekarang siap digunakan. 🎉
