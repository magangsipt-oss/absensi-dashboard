"use client";

import { useState, type FormEvent } from "react";

export default function RegularPage() {
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("SVM");
  const [templateId, setTemplateId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setMessageType("");

    try {
      const response = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          name,
          nickname,
          email,
          department,
          fingerprintId: templateId ? Number(templateId) : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Gagal menyimpan pendaftaran");

      setMessage(`Pendaftaran berhasil. Data ${name} sudah masuk ke admin dan menunggu tombol Map.`);
      setMessageType("success");
      setName("");
      setNickname("");
      setEmail("");
      setDepartment("SVM");
      setTemplateId("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal menyimpan pendaftaran");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe,_#eff6ff_32%,_#f8fafc_100%)] px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-4xl rounded-[32px] border border-sky-100 bg-white/90 p-6 shadow-[0_30px_80px_-30px_rgba(37,99,235,0.35)] backdrop-blur md:p-8">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-600">Regular / Person</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Pendaftaran pegawai</h1>
          </div>
          <div className="flex gap-2">
            <a href="/" className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              ← Kembali
            </a>
            <a href="/nation" className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-100">
              Buka Nation
            </a>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <form onSubmit={handleRegister} className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-xl font-bold text-slate-900">Daftar pegawai</h2>

            <div>
              <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700">Nama lengkap</label>
              <input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Contoh: Budi Santoso"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                required
              />
            </div>

            <div>
              <label htmlFor="nickname" className="mb-2 block text-sm font-medium text-slate-700">Nama panggilan</label>
              <input
                id="nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Contoh: Budi"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                required
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="contoh@email.com"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                required
              />
            </div>

            <div>
              <label htmlFor="department" className="mb-2 block text-sm font-medium text-slate-700">Departemen</label>
              <select
                id="department"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                <option value="SVM">SVM</option>
                <option value="PM">PM</option>
                <option value="TRL">TRL</option>
                <option value="K. UNIT">K. UNIT</option>
                <option value="PROJECT MANAGER">PROJECT MANAGER</option>
                <option value="UMBRELLA CORPORATION">UMBRELLA CORPORATION</option>
                <option value="SMKN 2">SMKN 2</option>
              </select>
            </div>

            <div>
              <label htmlFor="templateId" className="mb-2 block text-sm font-medium text-slate-700">
                ID fingerprint / template ID
              </label>
              <input
                id="templateId"
                type="number"
                min={1}
                max={127}
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
                placeholder="Contoh: 12"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </div>

            <a
              href="tel:083140682041"
              className="block w-full rounded-xl border border-sky-600 px-4 py-3 text-center font-semibold text-sky-700 transition hover:bg-sky-50"
            >
              HUBUNGI ADMIN
            </a>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-sky-600 px-4 py-3 font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Menyimpan..." : "KIRIM PENDAFTARAN"}
            </button>
          </form>

          <div className="rounded-[28px] border border-sky-200 bg-sky-50 p-5">
            <h2 className="text-xl font-bold text-slate-900">Informasi pendaftaran</h2>
            <div className="mt-4 rounded-xl border border-sky-200 bg-white p-4 text-sm text-slate-700">
              Silahkan hubungi admin 083140682041
            </div>
          </div>

          {message && (
            <div
              className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
                messageType === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {message}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
