import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Kebijakan Privasi | Absensi Digital",
  description: "Draf kebijakan privasi untuk fitur backup operasional Absensi Digital.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <article className="mx-auto max-w-3xl space-y-8 rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl md:p-10">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Absensi Digital
          </p>
          <h1 className="text-3xl font-bold text-white md:text-4xl">Kebijakan Privasi</h1>
          <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100">
            Draf untuk ditinjau oleh pengelola sistem. Draf ini belum menjadi kebijakan resmi.
          </p>
          <p className="text-sm text-slate-400">Terakhir diperbarui: 21 Oktober 2026</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Cakupan</h2>
          <p className="text-slate-300">
            Kebijakan ini menjelaskan pemrosesan data oleh fitur backup operasional Absensi
            Digital ke Google Drive. Kebijakan ini khusus untuk fitur backup tersebut dan tidak
            menggantikan kebijakan operasional lain dari sistem absensi.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Data yang dicadangkan</h2>
          <p className="text-slate-300">
            Snapshot mapping berisi data pegawai (ID, nama, nama panggilan, email, departemen,
            ID fingerprint yang menunggu proses, serta waktu pembuatan dan perubahan) dan daftar
            mapping (ID template fingerprint, ID perangkat, ID pegawai yang terkait, serta waktu
            dibuat). Snapshot mapping mingguan juga berisi log verifikasi fingerprint delapan hari
            terakhir, termasuk ID pegawai, perangkat dan template, status, catatan, serta waktu
            verifikasi dan pencatatan.
          </p>
          <p className="text-slate-300">
            Backup operasional harian juga mencakup seluruh data pegawai, catatan absensi (nama,
            ID pegawai bila tersedia, waktu, status, catatan, dan waktu pencatatan), mapping dan
            audit perubahan mapping, log verifikasi fingerprint, serta perintah perangkat. Backup
            harian ini dibuat oleh workflow terjadwal GitHub Actions dan disimpan di Google Drive.
          </p>
          <p className="text-slate-300">
            Fitur backup tidak menyertakan template biometrik fingerprint yang tersimpan pada
            sensor atau field template biometrik di database, serta tidak menyertakan kredensial
            WebAuthn dan public key. File bukan workbook Excel: data disimpan sebagai JSON yang
            dienkripsi dengan AES-256-GCM, berekstensi{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm text-emerald-200">.json.enc</code>.
            Setelah didekripsi oleh aplikasi, backup memuat waktu pembuatan, identitas host dan
            nama database sumber, daftar tabel serta jumlah baris, dan checksum integritas.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Tujuan dan penggunaan Google Drive</h2>
          <p className="text-slate-300">
            Data digunakan untuk membuat, memeriksa, dan memulihkan backup operasional harian
            serta backup mapping dan log verifikasi fingerprint agar data dapat dipulihkan jika
            terjadi kerusakan atau kehilangan data. Aplikasi meminta akses Google Drive terbatas
            melalui izin
            <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5 text-sm text-emerald-200">
              drive.file
            </code>
            untuk file backup yang dibuat aplikasi ini; aplikasi tidak meminta akses umum ke
            seluruh file Drive pengguna.
          </p>
          <p className="text-slate-300">
            File dienkripsi sebelum diunggah ke Google Drive menggunakan AES-256-GCM.
            Snapshot mapping dibuat oleh layanan aplikasi; backup operasional harian diproses oleh
            workflow GitHub Actions yang membaca database melalui koneksi khusus backup. Google
            menyimpan file backup pada akun Drive yang memberikan persetujuan OAuth.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Penyimpanan dan retensi</h2>
          <p className="text-slate-300">
            File backup di Google Drive dijadwalkan untuk dipertahankan hingga 365 hari. Backup
            harian dijalankan oleh GitHub Actions, sedangkan snapshot mapping dibuat oleh aplikasi
            saat mapping berubah dan secara mingguan. File yang lebih lama akan dihapus saat
            proses backup terkait berhasil berjalan. Pemilik akun Google tetap dapat mengelola
            file di Drive. Kunci enkripsi diperlukan untuk membuka backup; jika kunci hilang,
            backup terkait tidak dapat dipulihkan.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Keamanan dan pembagian data</h2>
          <p className="text-slate-300">
            Backup dienkripsi sebelum dikirim ke Google Drive. Akses fitur backup dibatasi oleh
            kredensial aplikasi dan konfigurasi layanan. Data backup tidak digunakan oleh fitur
            ini untuk iklan atau dijual kepada pihak lain. Google memproses dan menyimpan file
            sesuai layanan serta kebijakan privasinya sendiri.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Kontak dan permintaan</h2>
          <p className="text-slate-300">
            Untuk pertanyaan atau permintaan terkait data backup, hubungi email dukungan yang
            ditampilkan pada layar persetujuan Google aplikasi ini. Pengelola sistem akan
            meninjau permintaan dan mengelola file backup sesuai kebutuhan pemulihan dan masa
            retensinya.
          </p>
        </section>

        <footer className="border-t border-slate-700 pt-6 text-sm text-slate-400">
          <Link href="/" className="font-semibold text-emerald-300 hover:text-emerald-200">
            Kembali ke Absensi Digital
          </Link>
        </footer>
      </article>
    </main>
  );
}
