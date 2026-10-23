"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface AnnualAttendanceDay {
  date: string;
  dayName: string;
  isFuture: boolean;
  isClosed: boolean;
  totalEmployees: number;
  totalScans: number;
  hadir: number;
  terlambat: number;
  pulang: number;
  izin: number;
  alpha: number;
  employeeDetails: Array<{
    employeeId: number;
    name: string;
    status: string;
    time: string;
    note: string;
  }>;
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

const formatWeekday = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("id-ID", {
    timeZone: "Asia/Makassar",
    weekday: "short",
  });

const getEmployeeStatusLabel = (status: string, note: string) =>
  status === "Izin" && note.trim().toLowerCase().startsWith("sakit") ? "Sakit" : status;

const employeeStatusClass: Record<string, string> = {
  Hadir: "bg-emerald-100 text-emerald-800",
  Terlambat: "bg-amber-100 text-amber-800",
  Pulang: "bg-sky-100 text-sky-800",
  Izin: "bg-blue-100 text-blue-800",
  Sakit: "bg-violet-100 text-violet-800",
  Alpha: "bg-rose-100 text-rose-800",
  "Belum ada catatan": "bg-slate-100 text-slate-600",
};

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
  const [selectedDay, setSelectedDay] = useState<AnnualAttendanceDay | null>(null);
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
  const latestClosedWorkday = useMemo(
    () => [...workdays].reverse().find((day) => !day.isFuture && day.isClosed) ?? null,
    [workdays],
  );
  const closedWorkdays = useMemo(
    () => workdays.filter((day) => !day.isFuture && day.isClosed),
    [workdays],
  );
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
        alpha: result.alpha + (day.isClosed && !day.isFuture ? day.alpha : 0),
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
        alpha: previous.alpha + (day.isClosed && !day.isFuture ? day.alpha : 0),
      });
    });
    return [...months.entries()];
  }, [workdays]);

  const exportSummary = () => {
    if (!workdays.length) return;
    const csvRows = [
      ["Jenis rekap", "Periode", "Total Scan", "Hadir", "Terlambat", "Pulang", "Izin", "Alpha (orang-hari)"],
      ["Ringkasan bulanan", "", "", "", "", "", "", ""],
      ...monthlyTotals.map(([month, value]) => [
        "Akumulasi bulan",
        new Date(`${month}-01T00:00:00Z`).toLocaleDateString("id-ID", {
          month: "long",
          year: "numeric",
          timeZone: "Asia/Makassar",
        }),
        String(value.scan),
        String(value.hadir),
        String(value.terlambat),
        String(value.pulang),
        String(value.izin),
        String(value.alpha),
      ]),
      [
        "Akumulasi tahun ajaran (orang-hari, hari kerja ditutup)",
        `${summary?.year ?? ""}/${(summary?.year ?? 0) + 1}`,
        String(totals.scan),
        String(totals.hadir),
        String(totals.terlambat),
        String(totals.pulang),
        String(totals.izin),
        String(totals.alpha),
      ],
      ["Detail harian", "", "", "", "", "", "", ""],
      ...workdays.map((day) => [
        "Rincian harian",
        formatDate(day.date),
        String(day.totalScans),
        String(day.hadir),
        String(day.terlambat),
        String(day.pulang),
        String(day.izin),
        day.isClosed ? String(day.alpha) : "Belum ditutup",
      ]),
    ];

    if (latestClosedWorkday) {
      csvRows.splice(1, 0, [
        "Alpha hari kerja terakhir yang ditutup",
        formatDate(latestClosedWorkday.date),
        String(latestClosedWorkday.totalScans),
        String(latestClosedWorkday.hadir),
        String(latestClosedWorkday.terlambat),
        String(latestClosedWorkday.pulang),
        String(latestClosedWorkday.izin),
        String(latestClosedWorkday.alpha),
      ]);
    }

    downloadCsv(csvRows);
  };

  const exportDayDetails = (day: AnnualAttendanceDay) => {
    downloadCsv([
      ["Tanggal", "ID Pegawai", "Nama", "Status", "Waktu", "Catatan"],
      ...day.employeeDetails.map((employee) => [
        formatDate(day.date),
        String(employee.employeeId),
        employee.name,
        getEmployeeStatusLabel(employee.status, employee.note),
        employee.time,
        employee.note,
      ]),
    ]);
  };

  const selectedDayCounts = useMemo(() => {
    if (!selectedDay) return [];
    const counts = new Map<string, number>();
    selectedDay.employeeDetails.forEach((employee) => {
      const label = getEmployeeStatusLabel(employee.status, employee.note);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()];
  }, [selectedDay]);

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

        {!loading && !error && attendance?.annualSummary && <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {[
              ["Total scan", totals.scan, "text-indigo-700"],
              ["Hadir", totals.hadir, "text-emerald-700"],
              ["Terlambat", totals.terlambat, "text-amber-700"],
              ["Pulang", totals.pulang, "text-sky-700"],
              ["Izin", totals.izin, "text-blue-700"],
              ["Alpha tahun ajaran (orang-hari)", totals.alpha, "text-rose-700"],
            ].map(([label, value, color]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>{label === "Alpha tahun ajaran (orang-hari)" && <p className="mt-1 text-xs text-slate-500">{closedWorkdays.length} hari kerja ditutup{latestClosedWorkday ? ` · terakhir ${formatDate(latestClosedWorkday.date)}` : ""}</p>}</div>)}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Ringkasan per bulan</h2>
            <p className="mt-1 text-sm text-slate-500">
              Alpha bulanan dan tahunan menjumlahkan pegawai-hari hanya dari hari kerja yang sudah ditutup setelah pukul 19.00 WITA.
            </p>
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>{["Bulan", "Scan", "Hadir", "Terlambat", "Pulang", "Izin", "Alpha (orang-hari)"].map((title) => <th key={title} className="px-4 py-3 font-semibold">{title}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlyTotals.map(([month, value]) => (
                    <tr key={month} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium capitalize">{new Date(`${month}-01T00:00:00Z`).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Makassar" })}</td>
                      <td className="px-4 py-3">{value.scan}</td>
                      <td className="px-4 py-3 text-emerald-700">{value.hadir}</td>
                      <td className="px-4 py-3 text-amber-700">{value.terlambat}</td>
                      <td className="px-4 py-3 text-sky-700">{value.pulang}</td>
                      <td className="px-4 py-3 text-blue-700">{value.izin}</td>
                      <td className="px-4 py-3 text-rose-700">{value.alpha}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Detail hari kerja</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Alpha dihitung per pegawai setelah pukul 19.00 WITA, hanya pada hari kerja.
                </p>
              </div>
              <span className="text-sm text-slate-500">{closedWorkdays.length} dari {workdays.length} hari kerja ditutup</span>
            </div>
            <div className="mt-4 max-h-[520px] overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600">
                  <tr>
                    {["Tanggal", "Scan", "Hadir", "Terlambat", "Pulang", "Izin", "Alpha", "Aksi"].map((title) => (
                      <th key={title} className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-semibold">{title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleWorkdays.map((day) => (
                    <tr key={day.date} className={day.isFuture ? "text-slate-400" : "hover:bg-slate-50"}>
                      <td className="whitespace-nowrap px-4 py-3 font-medium">
                        <span className="capitalize">{formatWeekday(day.date)}, </span>{formatDate(day.date)}
                        {day.date === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date()) && !day.isClosed && (
                          <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">Hari belum ditutup</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{day.totalScans}</td>
                      <td className="px-4 py-3 text-emerald-700">{day.hadir}</td>
                      <td className="px-4 py-3 text-amber-700">{day.terlambat}</td>
                      <td className="px-4 py-3 text-sky-700">{day.pulang}</td>
                      <td className="px-4 py-3 text-blue-700">{day.izin}</td>
                      <td className="px-4 py-3 text-rose-700">{day.isClosed && !day.isFuture ? day.alpha : <span className="text-slate-400" title="Alpha dihitung setelah hari kerja ditutup">—</span>}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedDay(day)}
                            aria-label={`Lihat detail ${formatDate(day.date)}`}
                            title="Lihat detail pegawai"
                            className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"
                          >
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => exportDayDetails(day)}
                            aria-label={`Unduh detail ${formatDate(day.date)}`}
                            title="Unduh CSV detail pegawai"
                            className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"
                          >
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                              <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                              <path d="M5 17v3h14v-3" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>Halaman {currentAnnualPage} dari {annualPageCount} ({closedWorkdays.length} ditutup dari {workdays.length} hari kerja)</span>
              <div className="flex flex-wrap items-center gap-2">
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
      {selectedDay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedDay(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="annual-day-detail-title"
            className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Detail absensi harian</p>
                <h2 id="annual-day-detail-title" className="mt-1 text-xl font-bold capitalize text-slate-900">
                  {formatWeekday(selectedDay.date)}, {formatDate(selectedDay.date)}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedDay.isClosed
                    ? "Alpha otomatis hanya dihitung untuk pegawai tanpa catatan setelah pukul 19.00 WITA."
                    : "Hari belum ditutup; Alpha otomatis belum dihitung."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                aria-label="Tutup detail"
                className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </header>
            <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-4">
              {selectedDayCounts.map(([status, count]) => (
                <span key={status} className={`rounded-full px-3 py-1 text-xs font-semibold ${employeeStatusClass[status] || "bg-slate-100 text-slate-700"}`}>
                  {status}: {count}
                </span>
              ))}
            </div>
            <div className="overflow-auto p-5">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    {["Pegawai", "Status", "Waktu", "Catatan"].map((title) => (
                      <th key={title} className="border-b border-slate-200 px-3 py-3 font-semibold">{title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedDay.employeeDetails.map((employee) => {
                    const status = getEmployeeStatusLabel(employee.status, employee.note);
                    return (
                      <tr key={employee.employeeId}>
                        <td className="px-3 py-3 font-medium text-slate-900">{employee.name}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${employeeStatusClass[status] || "bg-slate-100 text-slate-700"}`}>
                            {status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-600">{employee.time}</td>
                        <td className="px-3 py-3 text-slate-600">{employee.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {selectedDay.employeeDetails.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">Tidak ada pegawai yang terdaftar untuk tanggal ini.</p>
              )}
            </div>
            <footer className="flex justify-end gap-2 border-t border-slate-200 p-4">
              <button
                type="button"
                onClick={() => exportDayDetails(selectedDay)}
                className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Unduh CSV detail
              </button>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Tutup
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
