"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface AttendanceRecord {
  id: number;
  employeeId?: number | null;
  name: string;
  time: string;
  status: string;
  note: string;
  checkedAt: string;
}

interface FingerprintVerificationLog {
  id: number;
  employeeId?: number | null;
  deviceId?: string | null;
  templateId: number;
  status: string;
  note?: string | null;
  verifiedAt: string;
}

interface Employee {
  id: number;
  name: string;
}

interface AnnualDay {
  date: string;
  totalScans: number;
  hadir: number;
  terlambat: number;
  pulang: number;
  izin: number;
  alpha: number;
  attendees: Array<{ name: string; status: string }>;
  absentEmployees: string[];
}

interface AttendanceState {
  today: string;
  records: AttendanceRecord[];
  employees: Employee[];
  verificationLogs?: FingerprintVerificationLog[];
  annualSummary?: { workdays: AnnualDay[] };
}

const jakartaDate = (value: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date(value));

const displayDate = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("id-ID", { timeZone: "Asia/Makassar",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

export default function DailySummaryPage() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [attendance, setAttendance] = useState<AttendanceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const requestedDate = new URLSearchParams(window.location.search).get("date")
      || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
    if (window.localStorage.getItem("admin_authenticated") !== "true") {
      router.push("/");
      return;
    }
    fetch("/api/attendance")
      .then(async (response) => {
        if (!response.ok) throw new Error("Gagal memuat rekap harian");
        return response.json();
      })
      .then((data) => {
        setDate(requestedDate);
        setAttendance(data);
      })
      .catch((reason: unknown) => {
        setDate(requestedDate);
        setError(reason instanceof Error ? reason.message : "Gagal memuat data");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const day = attendance?.annualSummary?.workdays.find((item) => item.date === date);
  const records = useMemo(
    () => attendance?.records.filter((record) => jakartaDate(record.checkedAt) === date) ?? [],
    [attendance?.records, date],
  );
  const verificationLogs = useMemo(
    () => attendance?.verificationLogs?.filter((log) => jakartaDate(log.verifiedAt) === date) ?? [],
    [attendance?.verificationLogs, date],
  );
  const rows = useMemo(() => (attendance?.employees ?? []).map((employee) => {
    const employeeRecords = records.filter((record) => record.employeeId === employee.id || (!record.employeeId && record.name === employee.name));
    const arrival = employeeRecords.find((record) => record.status === "Hadir" || record.status === "Terlambat");
    const departure = employeeRecords.find((record) => record.status === "Pulang");
    const manual = employeeRecords.find((record) => record.status === "Izin" || record.status === "Alpha");
    const summaryPerson = day?.attendees.find((person) => person.name === employee.name);
    return { employee, arrival, departure, manual, summaryPerson };
  }), [attendance?.employees, day?.attendees, records]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50 px-4 py-8 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col justify-between gap-4 rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Rekap harian</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{date ? displayDate(date) : "Memuat tanggal..."}</h1>
          </div>
          <button type="button" onClick={() => window.close()} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Tutup tab</button>
        </header>

        {loading && <section className="rounded-2xl bg-white p-6 text-slate-500">Memuat rekap...</section>}
        {error && <section className="rounded-2xl bg-rose-50 p-6 text-rose-700">{error}</section>}
        {!loading && !error && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {[
                ["Masuk", (day?.hadir ?? 0) + (day?.terlambat ?? 0), "text-emerald-700"],
                ["Keluar", day?.pulang ?? 0, "text-sky-700"],
                ["Hadir", day?.hadir ?? 0, "text-emerald-700"],
                ["Terlambat", day?.terlambat ?? 0, "text-amber-700"],
                ["Izin", day?.izin ?? 0, "text-blue-700"],
              ].map(([label, value, color]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p></div>)}
            </section>

            <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-emerald-600">Rekap absensi</p><h2 className="text-xl font-bold text-slate-900">Masuk dan keluar pegawai</h2></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{day?.totalScans ?? 0} scan</span></div>
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-emerald-50 text-slate-600"><tr>{["No", "Nama", "ID", "Masuk", "Pulang", "Keterangan"].map((title) => <th key={title} className="px-4 py-3 font-semibold">{title}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={row.employee.id} className="hover:bg-emerald-50/50"><td className="px-4 py-3 text-slate-500">{index + 1}</td><td className="px-4 py-3 font-medium text-slate-800">{row.employee.name}</td><td className="px-4 py-3 font-mono text-slate-600">{row.employee.id}</td><td className="px-4 py-3">{row.arrival?.time || "-"}</td><td className="px-4 py-3">{row.departure?.time || "-"}</td><td className="px-4 py-3 text-slate-600">{row.manual?.status || row.summaryPerson?.status || "-"}{row.manual?.note && row.manual.note !== "-" ? `: ${row.manual.note}` : ""}</td></tr>)}</tbody></table></div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-emerald-600">Riwayat verifikasi</p>
                  <h2 className="text-xl font-bold text-slate-900">Log fingerprint hari ini</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{verificationLogs.length} log</span>
              </div>
              <p className="mt-2 text-sm text-slate-500">Log yang memiliki nama pegawai dapat membantu mencocokkan Template ID dengan pegawai. Log tanpa pegawai belum membuktikan siapa pemilik ID tersebut.</p>
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      {["Waktu", "Nama pegawai", "Template ID", "Perangkat", "Status", "Catatan"].map((title) => <th key={title} className="px-4 py-3 font-semibold">{title}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {verificationLogs.length ? verificationLogs.map((log) => {
                      const employee = log.employeeId ? attendance?.employees.find((item) => item.id === log.employeeId) : null;
                      return (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-4 py-3">{new Date(log.verifiedAt).toLocaleTimeString("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="px-4 py-3">{employee?.name || "Belum terhubung ke pegawai"}</td>
                          <td className="px-4 py-3 font-semibold">{log.templateId}</td>
                          <td className="px-4 py-3">{log.deviceId || "-"}</td>
                          <td className="px-4 py-3">{log.status}</td>
                          <td className="px-4 py-3 text-slate-500">{log.note || "-"}</td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Tidak ada log fingerprint pada tanggal ini.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
