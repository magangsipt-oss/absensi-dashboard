# Deploy di VPS (menggantikan Vercel)

Aplikasi berjalan di VPS Ubuntu 24.04 `103.176.78.157`, dibuka lewat HTTPS di `https://103-176-78-157.sslip.io` (nama sslip.io menunjuk ke IP; sertifikat Let's Encrypt diperpanjang otomatis oleh `certbot.timer`).

## Komponen

| Komponen | Lokasi / nama |
|---|---|
| Aplikasi Next.js | `/opt/absensi/app`, layanan systemd `absensi` (port 3000, hanya `127.0.0.1`) |
| Reverse proxy + HTTPS | nginx, `/etc/nginx/sites-available/absensi` |
| Database | PostgreSQL 16 lokal, database `absensi`, hanya `127.0.0.1:5432` |
| Rahasia | `/etc/absensi/absensi.env` (root:absensi, mode 640) dan `/etc/absensi/db.pass` |
| Backup harian | `/usr/local/bin/absensi-backup.sh`, cron `/etc/cron.d/absensi`, hasil di `/var/backups/absensi` (30 hari) |
| Retensi absensi | `/usr/local/bin/absensi-retention.sh`, tiap tanggal 1 pukul 18.00 UTC |
| Salinan backup di luar server | Task Scheduler Windows `Absensi-Pull-VPS-Backup`, tiap hari 23.30, ke `D:\Absensi-backup\vps` |

Firewall (ufw) hanya membuka 22, 80, 443. Login SSH hanya dengan kunci; password dan root dimatikan (`/etc/ssh/sshd_config.d/00-hardening.conf`).

## Memperbarui aplikasi

Dari folder `absensi` di komputer kerja:

```bash
tar --exclude=node_modules --exclude=.next --exclude=.vercel --exclude='.env*' \
    --exclude=tsconfig.tsbuildinfo --exclude=data -czf - . \
  | ssh admin@103.176.78.157 "sudo bash -c 'tar -xzf - -C /opt/absensi/app && chown -R absensi:absensi /opt/absensi/app'"

ssh admin@103.176.78.157 'sudo bash -s' <<'EOF'
cd /opt/absensi/app
runuser -u absensi -- bash -c 'unset NODE_ENV; export HOME=/opt/absensi; npm ci --include=dev --no-audit --no-fund'
runuser -u absensi -- bash -c 'set -a; . /etc/absensi/absensi.env; set +a; export HOME=/opt/absensi NODE_OPTIONS=--max-old-space-size=1536; npx prisma migrate deploy && rm -rf .next && npx next build'
systemctl restart absensi
EOF
```

Catatan: `npm ci` harus dijalankan tanpa `NODE_ENV=production` agar paket pengembangan (Tailwind) terpasang, dan `.next` dihapus sebelum build supaya cache lama tidak merusak hasil.

## Backup dan pemulihan

- Cek backup: `ls -lh /var/backups/absensi` dan `/var/log/absensi-backup.log`.
- Pulihkan ke database kosong: `pg_restore --no-owner -d "<url tanpa parameter ?...>" file.dump`.
- Backup hanya berguna jika diuji. Coba pulihkan ke database sementara secara berkala.

## Kunci perangkat ESP32

`DEVICE_KEY` dan `ESP32_DEVICE_KEY` di `/etc/absensi/absensi.env` harus sama dengan `deviceKey` di firmware. Jangan menaruh kunci di repository publik.
