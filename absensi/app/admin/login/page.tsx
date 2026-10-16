"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const ADMIN_PASSWORD = "admin123";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password === ADMIN_PASSWORD) {
      setError("");
      router.push("/admin");
      return;
    }

    setError("Password yang Anda masukkan salah.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8 text-slate-100">
      <div className="w-full max-w-md rounded-[28px] border border-slate-700 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/50">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-emerald-300">Admin</p>
          <h1 className="mt-3 text-3xl font-bold text-white">Masuk ke sistem</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-200">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Masukkan password admin"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Masuk
          </button>
        </form>

        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-5 text-sm text-slate-400 underline underline-offset-4 hover:text-slate-200"
        >
          ← Kembali ke pilihan akses
        </button>
      </div>
    </main>
  );
}
