# Panduan Setup MySQL untuk Sistem Absensi

## 1. Persiapan Database MySQL

### A. Install MySQL (jika belum)
- Download dari: https://dev.mysql.com/downloads/mysql/
- Atau gunakan XAMPP/WAMP yang sudah include MySQL

### B. Buat Database Baru

Buka MySQL Command Line atau MySQL Workbench, jalankan:

```sql
CREATE DATABASE absensi_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE absensi_db;
```

## 2. Konfigurasi Koneksi MySQL

### Edit File `.env.local`

Buka file `d:\Absensi\absensi\.env.local` dan ubah dengan kredensial MySQL Anda:

```
DATABASE_URL="mysql://username:password@localhost:3306/absensi_db"
```

**Contoh:**
- Jika MySQL user: `root`, password: `12345678`
  ```
  DATABASE_URL="mysql://root:12345678@localhost:3306/absensi_db"
  ```

- Jika MySQL user: `admin`, password: `mypassword`
  ```
  DATABASE_URL="mysql://admin:mypassword@localhost:3306/absensi_db"
  ```

- Jika tanpa password:
  ```
  DATABASE_URL="mysql://root@localhost:3306/absensi_db"
  ```

## 3. Setup Database Schema

Jalankan perintah berikut di terminal:

```bash
cd d:\Absensi\absensi
npx prisma migrate dev --name init
```

Ini akan:
- Membuat tabel `employees` (pegawai)
- Membuat tabel `attendance_records` (catatan absensi)
- Generate Prisma client

## 4. (Opsional) Seed Data Awal

Jika mau menambahkan data awal, jalankan di MySQL:

```sql
INSERT INTO employees (name, email, department, createdAt, updatedAt) VALUES
('Rina Putri', 'rina@company.com', 'IT', NOW(), NOW()),
('Budi Santoso', 'budi@company.com', 'Marketing', NOW(), NOW()),
('Citra Lestari', 'citra@company.com', 'HR', NOW(), NOW());

INSERT INTO attendance_records (name, time, status, note, checkedAt, createdAt, employeeId) VALUES
('Rina Putri', '07:45', 'Hadir', 'Tepat waktu', NOW(), NOW(), 1),
('Budi Santoso', '08:10', 'Terlambat', 'Macet', NOW(), NOW(), 2),
('Citra Lestari', '-', 'Izin', 'Urusan keluarga', NOW(), NOW(), 3);
```

## 5. Jalankan Aplikasi

```bash
cd d:\Absensi\absensi
npm run dev
```

Buka browser:
- Halaman utama: http://localhost:3000
- Dashboard admin: http://localhost:3000/admin

## 6. Troubleshooting

### Error: "Can't reach database server"
- Pastikan MySQL sudah running (start service di Services)
- Cek credensial di .env.local
- Coba koneksi manual di MySQL Workbench

### Error: "Unknown database 'absensi_db'"
- Jalankan: `npx prisma migrate dev --name init`

### Error: "Access denied for user"
- Cek username dan password di .env.local
- Pastikan user MySQL sudah dibuat dengan privilege yang cukup

### Reset Database (Hapus semua data)
```bash
npx prisma migrate reset
```

## 7. Commands Penting

```bash
# Lihat data di database
npx prisma studio

# Generate Prisma client ulang
npx prisma generate

# Lihat schema database
npx prisma introspect
```

## Info Koneksi Default

Jika menggunakan XAMPP:
```
Host: localhost
Port: 3306
Username: root
Password: (kosong)
Database: absensi_db
```

Connection String:
```
mysql://root@localhost:3306/absensi_db
```
