"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const ADMIN_PASSWORD = "admin123";

export default function HomePage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<"admin" | "regular" | "serial" | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleAdminLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password.trim()) {
      setError("Masukkan password admin terlebih dahulu.");
      return;
    }
    if (password === ADMIN_PASSWORD) {
      window.localStorage.setItem("admin_authenticated", "true");
      setError("");
      router.push("/admin");
      return;
    }
    setError("Password admin salah. Silakan coba lagi.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#1f2937,_#0f172a_45%,_#020817)] px-4 py-10 text-slate-100">
      <div className="w-full max-w-6xl rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.65)] backdrop-blur-xl md:p-10">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-emerald-300">Absensi Digital</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white md:text-5xl">Pilih akses Anda</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-300 md:text-lg">
            Masuk sebagai admin untuk mengelola sistem, admin serial untuk mengatur perangkat, atau regular untuk mendaftarkan diri.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.7fr_0.9fr]">
          <div className="grid gap-6 md:grid-cols-3">
            <button type="button" onClick={() => { setSelectedRole("admin"); setError(""); }} className={`group rounded-[28px] border p-[1px] text-left transition hover:-translate-y-1 ${selectedRole === "admin" ? "border-emerald-400 shadow-lg shadow-emerald-500/20" : "border-emerald-200/60 shadow-lg shadow-emerald-200/20"}`}>
              <div className="flex h-full flex-col rounded-[27px] bg-slate-950/90 p-6 text-white">
                <span className="mb-5 w-fit rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Admin</span>
                <span className="text-3xl">🔐</span>
                <h2 className="mt-4 text-2xl font-bold">Masuk Admin</h2>
                <p className="mt-3 text-sm text-slate-300">Kelola absensi, pegawai, perangkat, dan mapping fingerprint.</p>
                <div className="mt-auto pt-6 font-semibold text-emerald-200">Pilih admin →</div>
              </div>
            </button>

            <button type="button" onClick={() => { setSelectedRole("regular"); setError(""); router.push("/nation"); }} className={`group rounded-[28px] border p-[1px] text-left transition hover:-translate-y-1 ${selectedRole === "regular" ? "border-sky-400 shadow-lg shadow-sky-500/20" : "border-sky-200/60 shadow-lg shadow-sky-200/20"}`}>
              <div className="flex h-full flex-col rounded-[27px] bg-slate-950/90 p-6 text-white">
                <span className="mb-5 w-fit rounded-full bg-sky-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">Regular</span>
                <span className="text-3xl">👤</span>
                <h2 className="mt-4 text-2xl font-bold">Regular / Person</h2>
                <p className="mt-3 text-sm text-slate-300">Daftar nama, ID pegawai, dan mapping sidik jari secara mandiri.</p>
                <div className="mt-auto pt-6 font-semibold text-sky-200">Pilih regular →</div>
              </div>
            </button>

          </div>

          <div className="rounded-[28px] border border-slate-700 bg-slate-950/70 p-6 shadow-2xl">
            {selectedRole === "admin" || selectedRole === "serial" ? (
              <form onSubmit={handleAdminLogin} className="space-y-5">
                <div><p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">{selectedRole === "serial" ? "Admin Serial" : "Login Admin"}</p><h2 className="mt-3 text-2xl font-bold text-white">Masukkan password</h2></div>
                <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan password admin" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400" />
                {error && <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
                <button type="submit" className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400">{selectedRole === "serial" ? "Masuk ke Admin Serial" : "Masuk ke Admin"}</button>
              </form>
            ) : (
              <div className="space-y-4 text-slate-300"><p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Akses</p><h2 className="text-2xl font-bold text-white">Pilih role untuk masuk</h2><p className="text-sm text-slate-400">Admin Serial akan meminta password sebelum pengaturan perangkat dibuka.</p></div>
            )}
          </div>
        </div>
      </div>
      <footer className="pb-6 text-center text-sm text-slate-400">
        <a href="/privacy" className="hover:text-emerald-300">
          Kebijakan privasi (draf)
        </a>
      </footer>
    </main>
  );
}
