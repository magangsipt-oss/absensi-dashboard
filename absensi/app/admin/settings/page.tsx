"use client";

import ArduinoSettings from "../arduino-settings";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-[#120e16] bg-[url('/attendance-background.svg')] bg-cover bg-center bg-fixed px-4 py-8">
      <main className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Pengaturan</h1>
              <p className="mt-2 text-slate-600">Konfigurasi perangkat dan sistem</p>
            </div>
            <a
              href="/admin"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              ← Kembali ke Admin
            </a>
          </div>
        </section>

        {/* Arduino Settings Section */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <ArduinoSettings />
        </section>
      </main>
    </div>
  );
}
