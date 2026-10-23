"use client";

import { useEffect, useState, type FormEvent } from "react";

interface Employee {
  id: number;
  name: string;
  email: string;
  department: string;
  createdAt: string;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formDepartment, setFormDepartment] = useState("Spm");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchEmployees = async () => {
    try {
      setError("");
      const response = await fetch("/api/employees");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal memuat data pegawai");
      if (!Array.isArray(data.employees)) {
        throw new Error("Respons server tidak berisi daftar pegawai yang valid.");
      }
      setEmployees(data.employees);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (editingId) {
        // Update existing employee (future feature)
        // For now, we'll just add new
        throw new Error("Edit feature belum tersedia");
      }

      const response = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          name: formName,
          email: formEmail,
          department: formDepartment,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Gagal menyimpan data");
      }

      const data = await response.json();
      if (Array.isArray(data.employees)) setEmployees(data.employees);
      else await fetchEmployees();
      setFormName("");
      setFormEmail("");
      setFormDepartment("Spm");
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan data");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Hapus pegawai ini beserta relasi mapping fingerprint-nya?")) return;

    try {
      setError("");
      const response = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          id,
          confirmation: "DELETE_EMPLOYEE",
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Gagal menghapus pegawai");
      }
      const data = await response.json();
      setEmployees(data.employees || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600"></div>
          <p className="text-slate-700">Memuat data pegawai...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8 sm:px-6 lg:px-8">
      <main className="mx-auto max-w-4xl">
        {/* Header */}
        <section className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Manajemen Pegawai</h1>
          <p className="mt-2 text-slate-600">Tambah, edit, dan kelola data pegawai</p>
          <div className="mt-4 flex gap-3">
            <a
              href="/"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              ← Kembali ke Dashboard
            </a>
            <a
              href="/admin"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Admin Panel
            </a>
          </div>
        </section>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Add Form */}
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="mb-8 rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700"
          >
            + Tambah Pegawai
          </button>
        ) : (
          <div className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-slate-900">Tambah Pegawai Baru</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Email *</label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="Contoh: budi@example.com"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Departemen *</label>
                <select
                  value={formDepartment}
                  onChange={(e) => setFormDepartment(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="Spm">Spm</option>
                  <option value="Mesin">Mesin</option>
                  <option value="Trl">Trl</option>
                  <option value="Project manager">Project manager</option>
                  <option value="K.unit">K.unit</option>
                  <option value="Smk2">Smk2</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? "Menyimpan..." : "Simpan"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Employees List */}
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-xl font-semibold text-slate-900">
              Daftar Pegawai ({employees.length})
            </h2>
          </div>

          {employees.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-slate-500">Belum ada pegawai terdaftar</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">No</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">Nama</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">Departemen</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">Bergabung</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-slate-700">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {employees.map((emp, idx) => (
                    <tr key={emp.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 text-sm text-slate-700">{idx + 1}</td>
                      <td className="px-6 py-3 text-sm font-medium text-slate-900">{emp.name}</td>
                      <td className="px-6 py-3 text-sm text-slate-600">{emp.email}</td>
                      <td className="px-6 py-3 text-sm text-slate-600">{emp.department}</td>
                      <td className="px-6 py-3 text-sm text-slate-600">
                        {new Date(emp.createdAt).toLocaleDateString("id-ID", { timeZone: "Asia/Makassar" })}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <button
                          onClick={() => handleDelete(emp.id)}
                          className="text-sm font-medium text-rose-600 hover:text-rose-700 hover:underline"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Info Card */}
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">💡 Tips:</p>
          <ul className="mt-2 ml-4 list-disc space-y-1">
            <li>Email harus unik untuk setiap pegawai</li>
            <li>Semua field wajib diisi</li>
            <li>Data akan tersimpan ke MySQL secara otomatis</li>
            <li>Gunakan halaman ini untuk manajemen data pegawai</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
