"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface MonthlyCell {
  code: string;
  status: string;
  time: string;
  note: string;
}

interface MonthlyEmployee {
  id: number;
  name: string;
  cells: Record<string, MonthlyCell | null>;
}

interface MonthlyState {
  month: string;
  days: number[];
  employees: MonthlyEmployee[];
}

const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Makassar" });
const currentWitaMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit" }).format(new Date());

const cellClass: Record<string, string> = {
  H: "bg-emerald-50 text-emerald-700",
  L: "bg-amber-50 text-amber-700",
  P: "bg-sky-50 text-sky-700",
  I: "bg-blue-50 text-blue-700",
  S: "bg-violet-50 text-violet-700",
  A: "bg-rose-50 text-rose-700",
};

export default function MonthlySummaryPage() {
  const router = useRouter();
  const [month, setMonth] = useState("");
  const [report, setReport] = useState<MonthlyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (window.localStorage.getItem("admin_authenticated") !== "true") {
      router.push("/");
      return;
    }
    const timer = window.setTimeout(() => {
      setMonth(new URLSearchParams(window.location.search).get("month") || currentWitaMonth());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router]);

  useEffect(() => {
    if (!month) return;
    fetch(`/api/attendance/monthly?month=${month}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Gagal memuat rekapitulasi bulanan");
        return response.json() as Promise<MonthlyState>;
      })
      .then(setReport)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Gagal memuat data"))
      .finally(() => setLoading(false));
  }, [month]);

  const exportCsv = () => {
    if (!report) return;
    const header = ["Nama", ...report.days.map(String)];
    const rows = report.employees.map((employee) => [employee.name, ...report.days.map((day) => employee.cells[`${report.month}-${String(day).padStart(2, "0")}`]?.code ?? "-")]);
    const csv = [header, ...rows].map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `rekapitulasi-absensi-${report.month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totals = useMemo(() => {
    const result: Record<string, number> = {};
    report?.employees.forEach((employee) => Object.values(employee.cells).forEach((cell) => { if (cell) result[cell.code] = (result[cell.code] || 0) + 1; }));
    return result;
  }, [report]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50 px-4 py-8 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="flex flex-col justify-between gap-4 rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Rekapitulasi kehadiran</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Rekap absensi bulanan</h1>
            <p className="mt-2 text-slate-600">Nama pegawai sebagai baris dan tanggal sebagai kolom</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-semibold text-slate-600">Bulan<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="ml-2 rounded-lg border border-slate-200 px-3 py-2 font-normal text-slate-800" /></label>
            <button type="button" onClick={exportCsv} disabled={!report} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Export CSV</button>
            <a href="/admin" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Dashboard</a>
          </div>
        </header>

        {(loading || !report || report.month !== month) && <section className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-500">Memuat rekapitulasi...</section>}
        {error && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">{error}</section>}
        {!loading && !error && report && report.month === month && <>
          <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div><p className="text-sm font-semibold uppercase tracking-[0.15em] text-emerald-600">Rekapitulasi Kehadiran</p><h2 className="mt-1 text-2xl font-bold capitalize text-slate-900">{monthLabel(report.month)}</h2></div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">Hadir {totals.H || 0}</span><span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">Terlambat {totals.L || 0}</span><span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">Izin {totals.I || 0}</span><span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">Alpha {totals.A || 0}</span></div>
            </div>
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="border-collapse text-center text-sm">
                <thead className="bg-slate-50 text-slate-700"><tr><th className="sticky left-0 z-10 min-w-56 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left font-semibold">Nama</th>{report.days.map((day) => <th key={day} className="min-w-11 border-b border-slate-200 px-2 py-3 font-semibold">{day}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{report.employees.map((employee) => <tr key={employee.id} className="hover:bg-slate-50"><th className="sticky left-0 z-[1] border-r border-slate-200 bg-white px-4 py-2 text-left font-medium text-slate-800">{employee.name}</th>{report.days.map((day) => { const cell = employee.cells[`${report.month}-${String(day).padStart(2, "0")}`]; return <td key={day} className="px-1 py-1"><span title={cell ? `${cell.status} - ${cell.time}${cell.note && cell.note !== "-" ? ` - ${cell.note}` : ""}` : "Belum ada data"} className={`flex h-8 w-9 items-center justify-center rounded-md font-semibold ${cell ? cellClass[cell.code] || "bg-slate-100 text-slate-600" : "text-slate-300"}`}>{cell?.code || "-"}</span></td>; })}</tr>)}</tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600"><span><b className="text-emerald-700">H</b> Hadir</span><span><b className="text-amber-700">L</b> Terlambat</span><span><b className="text-sky-700">P</b> Pulang</span><span><b className="text-blue-700">I</b> Izin</span><span><b className="text-violet-700">S</b> Sakit</span><span><b className="text-rose-700">A</b> Alpha</span><span><b>-</b> Belum ada data</span></div>
          </section>
        </>}
      </div>
    </main>
  );
}
