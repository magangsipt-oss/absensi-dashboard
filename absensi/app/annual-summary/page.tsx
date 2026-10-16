"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface AnnualAttendanceDay {
  date: string;
  isFuture: boolean;
  totalScans: number;
  hadir: number;
  terlambat: number;
  pulang: number;
  izin: number;
  alpha: number;
}

interface AttendanceState {
  annualSummary?: {
    year: number;
    workdays: AnnualAttendanceDay[];
  };
}

function getPageItems(totalPages: number, currentPage: number): Array<number | "..."> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, "...", totalPages];
  if (currentPage >= totalPages - 3) return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
}

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("id-ID", { timeZone: "Asia/Makassar",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const downloadCsv = (rows: string[][]) => {
  const content = rows
    .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "rekap-absensi-tahunan.csv";
  link.click();
  URL.revokeObjectURL(url);
};

export default function AnnualSummaryPage() {
  const router = useRouter();
  const [attendance, setAttendance] = useState<AttendanceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [annualPage, setAnnualPage] = useState(1);
  const annualPageSize = 10;

  useEffect(() => {
    if (window.localStorage.getItem("admin_authenticated") !== "true") {
      router.push("/");
      return;
    }

    fetch("/api/attendance")
      .then(async (response) => {
        if (!response.ok) throw new Error("Gagal memuat rekap tahunan");
        return response.json();
      })
      .then(setAttendance)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Gagal memuat data"))
      .finally(() => setLoading(false));
  }, [router]);

  const summary = attendance?.annualSummary;
  const workdays = useMemo(() => summary?.workdays ?? [], [summary?.workdays]);
  const annualPageCount = Math.max(1, Math.ceil(workdays.length / annualPageSize));
  const currentAnnualPage = Math.min(annualPage, annualPageCount);
  const visibleWorkdays = useMemo(() => {
    const start = (currentAnnualPage - 1) * annualPageSize;
    return workdays.slice(start, start + annualPageSize);
  }, [currentAnnualPage, workdays]);
  const totals = useMemo(
    () => workdays.reduce(
      (result, day) => ({
        scan: result.scan + day.totalScans,
        hadir: result.hadir + day.hadir,
        terlambat: result.terlambat + day.terlambat,
        pulang: result.pulang + day.pulang,
        izin: result.izin + day.izin,
        alpha: result.alpha + day.alpha,
      }),
      { scan: 0, hadir: 0, terlambat: 0, pulang: 0, izin: 0, alpha: 0 },
    ),
    [workdays],
  );

  const monthlyTotals = useMemo(() => {
    const months = new Map<string, typeof totals>();
    workdays.forEach((day) => {
      const month = day.date.slice(0, 7);
      const previous = months.get(month) ?? { scan: 0, hadir: 0, terlambat: 0, pulang: 0, izin: 0, alpha: 0 };
      months.set(month, {
        scan: previous.scan + day.totalScans,
        hadir: previous.hadir + day.hadir,
        terlambat: previous.terlambat + day.terlambat,
        pulang: previous.pulang + day.pulang,
        izin: previous.izin + day.izin,
        alpha: previous.alpha + day.alpha,
      });
    });
    return [...months.entries()];
  }, [workdays]);

  const exportSummary = () => {
    downloadCsv([
      ["Tanggal", "Total Scan", "Hadir", "Terlambat", "Pulang", "Izin", "Alpha"],
      ...workdays.map((day) => [formatDate(day.date), String(day.totalScans), String(day.hadir), String(day.terlambat), String(day.pulang), String(day.izin), String(day.alpha)]),
    ]);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 px-4 py-8 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col justify-between gap-4 rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Laporan absensi</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Rekap tahunan</h1>
            <p className="mt-2 text-slate-600">Ringkasan tahun ajaran {summary?.year ?? new Date().getFullYear()}/{(summary?.year ?? new Date().getFullYear()) + 1}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={exportSummary} disabled={!workdays.length} className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">Export CSV</button>
            <a href="/admin" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Dashboard</a>
          </div>
        </header>

        {loading && <section className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-500">Memuat rekap...</section>}
        {error && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">{error}</section>}

        {!loading && !error && <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {[
              ["Total scan", totals.scan, "text-indigo-700"],
              ["Hadir", totals.hadir, "text-emerald-700"],
              ["Terlambat", totals.terlambat, "text-amber-700"],
              ["Pulang", totals.pulang, "text-sky-700"],
              ["Izin", totals.izin, "text-blue-700"],
              ["Alpha", totals.alpha, "text-rose-700"],
            ].map(([label, value, color]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p></div>)}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Ringkasan per bulan</h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr>{["Bulan", "Scan", "Hadir", "Terlambat", "Pulang", "Izin", "Alpha"].map((title) => <th key={title} className="px-4 py-3 font-semibold">{title}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{monthlyTotals.map(([month, value]) => <tr key={month} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium">{new Date(`${month}-01T00:00:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</td><td className="px-4 py-3">{value.scan}</td><td className="px-4 py-3 text-emerald-700">{value.hadir}</td><td className="px-4 py-3 text-amber-700">{value.terlambat}</td><td className="px-4 py-3 text-sky-700">{value.pulang}</td><td className="px-4 py-3 text-blue-700">{value.izin}</td><td className="px-4 py-3 text-rose-700">{value.alpha}</td></tr>)}</tbody></table></div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Detail hari kerja</h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr>{["Tanggal", "Scan", "Hadir", "Terlambat", "Pulang", "Izin", "Alpha"].map((title) => <th key={title} className="px-4 py-3 font-semibold">{title}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{visibleWorkdays.map((day) => <tr key={day.date} className={day.isFuture ? "text-slate-400" : "hover:bg-slate-50"}><td className="px-4 py-3 font-medium">{formatDate(day.date)}</td><td className="px-4 py-3">{day.totalScans}</td><td className="px-4 py-3 text-emerald-700">{day.hadir}</td><td className="px-4 py-3 text-amber-700">{day.terlambat}</td><td className="px-4 py-3 text-sky-700">{day.pulang}</td><td className="px-4 py-3 text-blue-700">{day.izin}</td><td className="px-4 py-3 text-rose-700">{day.alpha}</td></tr>)}</tbody></table></div>
            <div className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>Halaman {currentAnnualPage} dari {annualPageCount} ({workdays.length} hari kerja)</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAnnualPage((page) => Math.max(1, page - 1))} disabled={currentAnnualPage <= 1} className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Sebelumnya</button>
                {getPageItems(annualPageCount, currentAnnualPage).map((page, index) => page === "..." ? (
                  <span key={`ellipsis-${index}`} className="flex h-10 min-w-10 items-center justify-center px-1 text-slate-400">...</span>
                ) : (
                  <button key={page} type="button" onClick={() => setAnnualPage(page)} className={`h-10 min-w-10 rounded-full px-3 font-semibold ${page === currentAnnualPage ? "bg-indigo-600 text-white" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`} aria-current={page === currentAnnualPage ? "page" : undefined}>{page}</button>
                ))}
                <button type="button" onClick={() => setAnnualPage((page) => Math.min(annualPageCount, page + 1))} disabled={currentAnnualPage >= annualPageCount} className="rounded-full bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">Berikutnya</button>
              </div>
            </div>
          </section>
        </>}
      </div>
    </main>
  );
}
