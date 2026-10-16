"use client";

import { useEffect, useState, type FormEvent } from "react";

interface AttendanceRecord {
  id: number;
  employeeId?: number | null;
  name: string;
  time: string;
  status: string;
  note: string;
  checkedAt: string;
}

interface Employee {
  id: number;
  name: string;
  email: string;
  department: string;
  createdAt: string;
  pendingFingerprintId?: number | null;
}

interface FingerprintMapping {
  id: number;
  deviceId?: string | null;
  templateId: number;
  employeeId?: number | null;
  createdAt: string;
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

interface AnnualAttendanceDay {
  date: string;
  dayName: string;
  isFuture: boolean;
  totalEmployees: number;
  totalScans: number;
  hadir: number;
  terlambat: number;
  pulang: number;
  izin: number;
  sakit: number;
  alpha: number;
  attendees: Array<{ name: string; status: string }>;
  departedEmployees: string[];
  absentEmployees: string[];
}

interface AttendanceState {
  today: string;
  records: AttendanceRecord[];
  employees: Employee[];
  mappings?: FingerprintMapping[];
  verificationLogs?: FingerprintVerificationLog[];
  annualSummary?: {
    year: number;
    workdays: AnnualAttendanceDay[];
  };
}

interface MonthlyCell {
  code: string;
  status: string;
  time: string;
  note: string;
}

interface MonthlyReport {
  month: string;
  days: number[];
  employees: Array<{
    id: number;
    name: string;
    department: string;
    cells: Record<string, MonthlyCell | null>;
  }>;
}

function getPageItems(totalPages: number, currentPage: number): Array<number | "..."> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, "...", totalPages];
  if (currentPage >= totalPages - 3) return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
}

const getWitaDateKey = (value: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date(value));
const getWitaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());

export default function AdminPage() {
  const [attendance, setAttendance] = useState<AttendanceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("Semua");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fingerprintListener, setFingerprintListener] = useState("Menyiapkan listener fingerprint...");
  const [dailyModalOpen, setDailyModalOpen] = useState(false);
  const [dailyEmployeeId, setDailyEmployeeId] = useState("");
  const [dailyStatus, setDailyStatus] = useState("Site");
  const [dailyDate, setDailyDate] = useState(getWitaToday());
  const [dailyTime, setDailyTime] = useState("08:00");
  const [dailyNote, setDailyNote] = useState("");
  const [monthlyMonth, setMonthlyMonth] = useState("");
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [monthlyDepartment, setMonthlyDepartment] = useState("Semua");
  const [annualPage, setAnnualPage] = useState(1);
  const annualPageSize = 10;

  const fetchAttendance = async () => {
    try {
      const response = await fetch("/api/attendance");
      if (!response.ok) {
        throw new Error("Gagal memuat data absensi");
      }
      const data = await response.json();
      setAttendance(data);
    } catch (err) {
      console.error(err);
      setAttendance({
        today: getWitaToday(),
        records: [],
        employees: [],
        mappings: [],
      });
      setMsg("Data absensi belum siap. Cek koneksi database atau jalankan server.");
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = (rows: string[][], filename: string) => {
    const csvContent = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    if (!attendance) return;
    const rows = [["No", "Nama", "Jam", "Status", "Catatan", "Waktu"]];
    attendance.records.forEach((record, idx) => {
      rows.push([String(idx + 1), record.name, record.time, record.status, record.note, record.checkedAt]);
    });
    downloadCSV(rows, "absensi.csv");
  };

  const handleDeleteRecord = async (recordId: number) => {
    setBusy(true);
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteRecord", recordId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Gagal menghapus record");
      }
      setAttendance(data);
    } catch (err) {
      console.error(err);
      setMsg(err instanceof Error ? err.message : "Gagal menghapus record");
      setTimeout(() => setMsg(null), 4000);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEmployee = async (employee: Employee) => {
    if (!window.confirm(`Hapus pegawai ${employee.name}, mapping fingerprint, dan fingerprint ESP32 terkait?`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", employeeId: employee.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal menghapus pegawai");
      setAttendance(data);
      setMsg(`Pegawai ${employee.name} dan data fingerprint terkait berhasil dihapus.`);
      window.setTimeout(() => setMsg(null), 4000);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Gagal menghapus pegawai");
    } finally {
      setBusy(false);
    }
  };

  const handleAddDaily = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dailyEmployeeId || !dailyDate) {
      setMsg("Pilih pegawai dan tanggal terlebih dahulu.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addDaily",
          employeeId: Number(dailyEmployeeId),
          status: dailyStatus,
          tgl: dailyDate,
          masuk: dailyTime || "-",
          keterangan: dailyNote,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal menambahkan absensi");
      setAttendance(data);
      setDailyModalOpen(false);
      setDailyNote("");
      setMsg("Rekap harian berhasil ditambahkan.");
      window.setTimeout(() => setMsg(null), 3000);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Gagal menambahkan absensi");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMonthlyMonth(new URLSearchParams(window.location.search).get("month") || getWitaToday().slice(0, 7));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!monthlyMonth) return;
    const loadMonthlyReport = () => fetch(`/api/attendance/monthly?month=${monthlyMonth}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Gagal memuat rekapitulasi bulanan");
        return response.json() as Promise<MonthlyReport>;
      })
      .then(setMonthlyReport)
      .catch((error: unknown) => setMsg(error instanceof Error ? error.message : "Gagal memuat rekapitulasi bulanan"));

    loadMonthlyReport();
    const intervalId = window.setInterval(loadMonthlyReport, 5000);
    return () => window.clearInterval(intervalId);
  }, [monthlyMonth]);

  useEffect(() => {
    let cancelled = false;

    // Vercel cannot access the computer's COM port. The ESP32 sends directly
    // to the deployed API, so the local serial listener is only for localhost.
    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      setFingerprintListener("Menunggu data fingerprint dari ESP32 online");
      return () => {
        cancelled = true;
      };
    }

    const listenForFingerprint = async () => {
      try {
        const modeResponse = await fetch("/api/serial-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "setScanMode", enabled: true }),
        });
        if (!modeResponse.ok) throw new Error("Gagal mengaktifkan listener serial");
        if (!cancelled) setFingerprintListener("Listener fingerprint aktif");

        while (!cancelled) {
          const response = await fetch("/api/serial-config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "scanFingerprint" }),
          });
          const result = await response.json().catch(() => ({}));

          if (response.ok && result.saved) {
            await fetchAttendance();
            if (!cancelled) {
              setFingerprintListener(result.skipped ? "Scan duplikat, tidak dicatat ulang" : `Berhasil absen: ${result.employeeName || `ID ${result.fingerprintId}`}`);
            }
          } else if (response.ok && result.fingerprintId && !cancelled) {
            setFingerprintListener(`Fingerprint terbaca: ID ${result.fingerprintId}, belum tersimpan`);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setFingerprintListener("Listener gagal, mencoba lagi dalam 3 detik...");
          window.setTimeout(() => {
            if (!cancelled) listenForFingerprint();
          }, 3000);
        }
      }
    };

    listenForFingerprint();
    return () => {
      cancelled = true;
    };
  }, []);

  // server info for ESP32 connection
  interface ServerInfo {
    ip: string | null;
    port: string | null;
    publicUrl: string | null;
  }

  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  const [devices, setDevices] = useState<Record<string, string>>({});
  const [deviceIdInput, setDeviceIdInput] = useState("");
  const [deviceIpInput, setDeviceIpInput] = useState("");

  const fetchDevices = async () => {
    try {
      const res = await fetch("/api/devices");
      if (!res.ok) return;
      const json = await res.json();
      setDevices(json.devices || {});
    } catch (e) {}
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const addDevice = async () => {
    if (!deviceIdInput || !deviceIpInput) return alert("Isi deviceId dan IP");
    setBusy(true);
    try {
      const res = await fetch("/api/devices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: deviceIdInput, ip: deviceIpInput }) });
      const json = await res.json();
      if (res.ok) setDevices(json.devices || {});
      setDeviceIdInput("");
      setDeviceIpInput("");
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch("/api/server-info");
        if (!res.ok) return;
        const json = await res.json();
        setServerInfo(json);
      } catch (e) {
        // ignore
      }
    };
    fetchInfo();
  }, []);

  // helpers: base64url <-> ArrayBuffer
  const bufferToBase64Url = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  };

  const base64UrlToBuffer = (base64urlStr: string) => {
    const padding = "=".repeat((4 - (base64urlStr.length % 4)) % 4);
    const base64 = base64urlStr.replace(/-/g, "+").replace(/_/g, "/") + padding;
    const raw = atob(base64);
    const buffer = new ArrayBuffer(raw.length);
    const uint = new Uint8Array(buffer);
    for (let i = 0; i < raw.length; ++i) uint[i] = raw.charCodeAt(i);
    return buffer;
  };

  const bufferToBase64 = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const base64ToBuffer = (b64: string) => {
    const raw = atob(b64);
    const buffer = new ArrayBuffer(raw.length);
    const uint = new Uint8Array(buffer);
    for (let i = 0; i < raw.length; ++i) uint[i] = raw.charCodeAt(i);
    return buffer;
  };

  // Register biometric (WebAuthn) for an employee
  const registerBiometric = async (employeeId: number) => {
    try {
      setMsg("Memulai pendaftaran biometric...");
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "webauthnRegisterOptions", employeeId }),
      });
      const options = await res.json();
      if (!res.ok) {
        setMsg("Gagal mendapatkan options: " + (options.error || res.statusText));
        return;
      }

      // convert challenges and ids to ArrayBuffers
      options.challenge = base64UrlToBuffer(options.challenge);
      if (options.user && options.user.id) options.user.id = base64UrlToBuffer(options.user.id);
      if (options.excludeCredentials)
        options.excludeCredentials = options.excludeCredentials.map((c: any) => ({ ...c, id: base64UrlToBuffer(c.id) }));

      const credential: any = await (navigator as any).credentials.create({ publicKey: options });
      if (!credential) throw new Error("No credential returned");

      const attestation = {
        id: credential.id,
        rawId: bufferToBase64Url(credential.rawId),
        response: {
          clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
          attestationObject: bufferToBase64Url(credential.response.attestationObject),
        },
        type: credential.type,
      };

      const verifyRes = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "webauthnRegisterVerify", employeeId, attestation }),
      });
      const verifyJson = await verifyRes.json();
      if (verifyRes.ok) {
        setMsg("Pendaftaran biometric berhasil.");
        await fetchAttendance();
      } else {
        setMsg("Pendaftaran gagal: " + (verifyJson.error || "unknown"));
      }
    } catch (err: any) {
      console.error(err);
      setMsg("Error pendaftaran: " + (err.message || err));
    } finally {
      setTimeout(() => setMsg(null), 4000);
    }
  };

  // Authenticate (check-in) using biometric
  const checkInWithBiometric = async (employeeId: number) => {
    try {
      setMsg("Memulai autentikasi biometric...");
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "webauthnAuthOptions", employeeId }),
      });
      const options = await res.json();
      if (!res.ok) {
        setMsg("Gagal membuat options: " + (options.error || res.statusText));
        return;
      }

      options.challenge = base64UrlToBuffer(options.challenge);
      if (options.allowCredentials)
        options.allowCredentials = options.allowCredentials.map((c: any) => ({ ...c, id: base64UrlToBuffer(c.id) }));

      const assertion: any = await (navigator as any).credentials.get({ publicKey: options });
      if (!assertion) throw new Error("No assertion returned");

      const clientAssertion = {
        id: assertion.id,
        rawId: bufferToBase64Url(assertion.rawId),
        response: {
          authenticatorData: bufferToBase64Url(assertion.response.authenticatorData),
          clientDataJSON: bufferToBase64Url(assertion.response.clientDataJSON),
          signature: bufferToBase64Url(assertion.response.signature),
          userHandle: assertion.response.userHandle ? bufferToBase64Url(assertion.response.userHandle) : null,
        },
        type: assertion.type,
      };

      const verifyRes = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "webauthnAuthVerify", employeeId, assertion: clientAssertion }),
      });
      const verifyJson = await verifyRes.json();
      if (verifyRes.ok) {
        setMsg("Check-in berhasil lewat fingerprint.");
        await fetchAttendance();
      } else {
        setMsg("Autentikasi gagal: " + (verifyJson.error || "unknown"));
      }
    } catch (err: any) {
      console.error(err);
      setMsg("Error autentikasi: " + (err.message || err));
    } finally {
      setTimeout(() => setMsg(null), 4000);
    }
  };

  const safeAttendance: AttendanceState = attendance ?? {
    today: getWitaToday(),
    records: [],
    employees: [],
    mappings: [],
    verificationLogs: [],
    annualSummary: { year: new Date().getFullYear(), workdays: [] },
  };

  const stats = {
    Hadir: safeAttendance.records.filter((r) => r.status === "Hadir").length,
    Terlambat: safeAttendance.records.filter((r) => r.status === "Terlambat").length,
    Izin: safeAttendance.records.filter((r) => r.status === "Izin").length,
    Alpha: safeAttendance.records.filter((r) => r.status === "Alpha").length,
  };

  const filteredRecords =
    filterStatus === "Semua"
      ? safeAttendance.records
      : safeAttendance.records.filter((r) => r.status === filterStatus);

  const todaySummary = safeAttendance.annualSummary?.workdays.find((day) => day.date === safeAttendance.today);
  const annualWorkdays = safeAttendance.annualSummary?.workdays ?? [];
  const annualPageCount = Math.max(1, Math.ceil(annualWorkdays.length / annualPageSize));
  const currentAnnualPage = Math.min(annualPage, annualPageCount);
  const visibleAnnualWorkdays = annualWorkdays.slice(
    (currentAnnualPage - 1) * annualPageSize,
    currentAnnualPage * annualPageSize,
  );
  const todayRecords = safeAttendance.records.filter((record) => getWitaDateKey(record.checkedAt) === safeAttendance.today);
  const dailyRows = safeAttendance.employees.map((employee) => {
    const employeeRecords = todayRecords.filter((record) => record.employeeId === employee.id || (!record.employeeId && record.name === employee.name));
    const arrival = employeeRecords.find((record) => ["Hadir", "Terlambat"].includes(record.status));
    const departure = employeeRecords.find((record) => record.status === "Pulang");
    const manualStatus = employeeRecords.find((record) => ["Izin", "Alpha"].includes(record.status));
    return { employee, arrival, departure, manualStatus };
  });
  const monthlyCellClass: Record<string, string> = {
    H: "bg-emerald-50 text-emerald-700",
    SITE: "bg-teal-50 text-teal-700",
    L: "bg-amber-50 text-amber-700",
    P: "bg-sky-50 text-sky-700",
    I: "bg-blue-50 text-blue-700",
    S: "bg-violet-50 text-violet-700",
    A: "bg-rose-50 text-rose-700",
  };
  const monthlyDepartments = [
    "Semua",
    ...Array.from(new Set(monthlyReport?.employees.map((employee) => employee.department).filter(Boolean) ?? [])).sort(),
  ];
  const visibleMonthlyEmployees = monthlyReport?.employees.filter(
    (employee) => monthlyDepartment === "Semua" || employee.department === monthlyDepartment,
  ) ?? [];
  const monthlySummaries = visibleMonthlyEmployees.map((employee) => {
    const cells = Object.values(employee.cells).filter((cell): cell is MonthlyCell => cell !== null);
    const hadir = cells.filter((cell) => cell.code === "H").length;
    const terlambat = cells.filter((cell) => cell.code === "L").length;
    const pulang = cells.filter((cell) => cell.code === "P").length;
    const izin = cells.filter((cell) => cell.code === "I").length;
    const sakit = cells.filter((cell) => cell.code === "S").length;
    const alpha = cells.filter((cell) => cell.code === "A").length;
    const site = cells.filter((cell) => cell.code === "SITE").length;
    const totalHadir = hadir + site + terlambat + pulang;
    const totalTercatat = cells.length;
    return {
      employee,
      hadir,
      site,
      terlambat,
      alpha,
      izin,
      sakit,
      totalHadir,
      attendancePercent: totalTercatat > 0 ? Math.round((totalHadir / totalTercatat) * 100) : 0,
    };
  });

  const latestFingerprint = [...(safeAttendance.mappings ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];

  const latestFingerprintEmployee = latestFingerprint?.employeeId
    ? safeAttendance.employees.find((employee) => employee.id === latestFingerprint.employeeId)
    : null;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchAttendance();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8 text-slate-800 sm:px-6 lg:px-8">
      <main className="mx-auto max-w-6xl space-y-6">
        {msg && <div className="mb-4 rounded bg-yellow-50 p-3 text-sm text-yellow-800">{msg}</div>}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Admin Dashboard</h1>
              <p className="mt-2 text-slate-600">Kelola dan pantau seluruh data absensi</p>
            </div>
            <a
              href="/"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              ← Kembali
            </a>
            <a
              href="/annual-summary"
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              Rekap tahunan
            </a>
            <a
              href="/monthly-summary"
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Rekapitulasi bulanan
            </a>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-slate-500">Koneksi Perangkat</p>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {serverInfo?.ip ? "Deteksi otomatis aktif" : "Masukkan IP manual"}
            </span>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-600">Alamat lokal (untuk ESP32 di jaringan yang sama)</p>
              <p className="mt-1 font-mono text-sm text-slate-800">
                {serverInfo?.ip ? `http://${serverInfo.ip}:${serverInfo.port}` : "-"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-600">URL publik (jika tersedia)</p>
              <p className="mt-1 font-mono text-sm text-slate-800">{serverInfo?.publicUrl ?? "-"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const txt = serverInfo?.ip ? `http://${serverInfo.ip}:${serverInfo.port}` : "";
                  if (txt) navigator.clipboard.writeText(txt);
                }}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Salin lokal
              </button>
              <button
                onClick={() => {
                  const txt = serverInfo?.publicUrl ?? "";
                  if (txt) navigator.clipboard.writeText(txt);
                }}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Salin publik
              </button>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-emerald-700">Registrasi IP ESP32</p>
              <h2 className="text-xl font-bold text-slate-900">Daftarkan perangkat yang akan terhubung</h2>
            </div>
            <button onClick={fetchDevices} className="rounded border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-700">Refresh</button>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_0.9fr]">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Device ID</label>
                <input value={deviceIdInput} onChange={(e) => setDeviceIdInput(e.target.value)} placeholder="Contoh: ESP32-01" className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">IP Address ESP32</label>
                <input value={deviceIpInput} onChange={(e) => setDeviceIpInput(e.target.value)} placeholder="Contoh: 192.168.1.50" className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500" />
              </div>
              <div className="flex items-end gap-2">
                <button onClick={addDevice} disabled={busy} className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">Simpan IP</button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">ID Finger terakhir</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-lg font-bold text-emerald-700">
                  {latestFingerprint?.templateId ?? "-"}
                </span>
                <span className="text-sm text-slate-600">Template ID</span>
              </div>
              <p className="mt-3 text-sm text-slate-700">
                {latestFingerprintEmployee ? `Pegawai: ${latestFingerprintEmployee.name}` : "Belum ada finger yang terdaftar"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {latestFingerprint?.deviceId ? `Device: ${latestFingerprint.deviceId}` : "Device: belum ditetapkan"}
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-600">Gunakan IP ini untuk menghubungkan ESP32 ke server web absensi pada jaringan yang sama.</p>

          <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-600 text-xs">
                    <th className="px-3 py-2">Device ID</th>
                    <th className="px-3 py-2">IP</th>
                    <th className="px-3 py-2">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(devices).length === 0 ? (
                    <tr><td colSpan={3} className="px-3 py-4 text-slate-500">Belum ada perangkat terdaftar</td></tr>
                  ) : (
                    Object.entries(devices).map(([id, ip]) => (
                      <tr key={id} className="border-t">
                        <td className="px-3 py-2 font-medium">{id}</td>
                        <td className="px-3 py-2 font-mono">{ip}</td>
                        <td className="px-3 py-2">
                          <button onClick={() => navigator.clipboard.writeText(ip)} className="text-xs font-semibold text-slate-700">Salin IP</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Hadir", value: stats.Hadir, accent: "bg-emerald-100 text-emerald-700" },
            { label: "Terlambat", value: stats.Terlambat, accent: "bg-amber-100 text-amber-700" },
            { label: "Izin", value: stats.Izin, accent: "bg-blue-100 text-blue-700" },
            { label: "Alpha", value: stats.Alpha, accent: "bg-rose-100 text-rose-700" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-600">{item.label}</p>
              <p className={`mt-3 rounded-lg px-3 py-2 text-2xl font-bold ${item.accent}`}>
                {item.value}
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium text-emerald-700">Rekapan harian</p>
              <h2 className="text-xl font-bold text-slate-900">Rekapan hari ini</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">{safeAttendance.today}</span>
              <button
                type="button"
                onClick={() => {
                  setDailyDate(safeAttendance.today);
                  setDailyEmployeeId(safeAttendance.employees[0] ? String(safeAttendance.employees[0].id) : "");
                  setDailyModalOpen(true);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-2xl font-light text-white shadow-sm transition hover:bg-emerald-700"
                aria-label="Tambah absensi harian"
              >
                +
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {[
              ["Hadir", (todaySummary?.hadir ?? stats.Hadir) + (todaySummary?.terlambat ?? stats.Terlambat)],
              ["Pulang", todaySummary?.pulang ?? 0],
              ["Izin", todaySummary?.izin ?? 0],
              ["Sakit", todaySummary?.sakit ?? 0],
              ["Terlambat", todaySummary?.terlambat ?? stats.Terlambat],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-emerald-100 bg-white p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-emerald-100 bg-white p-4">
              <p className="text-sm font-semibold text-slate-700">Pegawai hadir</p>
              <p className="mt-2 text-sm text-slate-600">
                {todaySummary?.attendees.length ? todaySummary.attendees.map((person) => `${person.name} (${person.status})`).join(", ") : "Belum ada pegawai hadir"}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white p-4">
              <p className="text-sm font-semibold text-slate-700">Pegawai alpha</p>
              <p className="mt-2 text-sm text-slate-600">
                {todaySummary?.absentEmployees.length ? todaySummary.absentEmployees.join(", ") : "Tidak ada data alpha"}
              </p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-emerald-100 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-emerald-50 text-slate-600">
                <tr>
                  <th className="px-3 py-3 font-semibold">No</th>
                  <th className="px-3 py-3 font-semibold">Nama</th>
                  <th className="px-3 py-3 font-semibold">ID</th>
                  <th className="px-3 py-3 font-semibold">Masuk</th>
                  <th className="px-3 py-3 font-semibold">Pulang</th>
                  <th className="px-3 py-3 font-semibold">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50">
                {dailyRows.map((row, index) => (
                  <tr key={row.employee.id} className="hover:bg-emerald-50/50">
                    <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{row.employee.name}</td>
                    <td className="px-3 py-2 font-mono text-slate-600">{row.employee.id}</td>
                    <td className="px-3 py-2 text-slate-700">{row.arrival?.time || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{row.departure?.time || "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{row.manualStatus?.status || row.arrival?.status || "-"}{row.manualStatus?.note && row.manualStatus.note !== "-" ? `: ${row.manualStatus.note}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium text-emerald-700">Rekapitulasi kehadiran</p>
              <h2 className="text-xl font-bold capitalize text-slate-900">Rekap absensi {monthlyMonth || "bulanan"}</h2>
              <p className="mt-1 text-sm text-slate-500">Nama pegawai sebagai baris dan tanggal sebagai kolom</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-semibold text-slate-600">Bulan<input type="month" value={monthlyMonth} onChange={(event) => setMonthlyMonth(event.target.value)} className="ml-2 rounded-lg border border-slate-200 px-3 py-2 font-normal text-slate-800" /></label>
              <label className="text-sm font-semibold text-slate-600">Departemen<select value={monthlyDepartment} onChange={(event) => setMonthlyDepartment(event.target.value)} className="ml-2 rounded-lg border border-slate-200 px-3 py-2 font-normal text-slate-800"><option value="Semua">Semua departemen</option>{monthlyDepartments.filter((department) => department !== "Semua").map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
              <a href={`/monthly-summary?month=${monthlyMonth}`} target="_blank" rel="noreferrer" className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Buka detail</a>
            </div>
          </div>
          {!monthlyReport || monthlyReport.month !== monthlyMonth ? (
            <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Memuat rekapitulasi...</p>
          ) : (
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="border-collapse text-center text-sm">
                <thead className="bg-slate-50 text-slate-700"><tr><th className="sticky left-0 z-10 min-w-56 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left font-semibold">Nama</th>{monthlyReport.days.map((day) => <th key={day} className="min-w-11 border-b border-slate-200 px-2 py-3 font-semibold">{day}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{visibleMonthlyEmployees.map((employee) => <tr key={employee.id} className="hover:bg-slate-50"><th className="sticky left-0 z-[1] border-r border-slate-200 bg-white px-4 py-2 text-left font-medium text-slate-800">{employee.name}</th>{monthlyReport.days.map((day) => { const cell = employee.cells[`${monthlyReport.month}-${String(day).padStart(2, "0")}`]; return <td key={day} className="px-1 py-1"><span title={cell ? `${cell.status} - ${cell.time}${cell.note !== "-" ? ` - ${cell.note}` : ""}` : "Belum ada data"} className={`flex h-8 w-9 items-center justify-center rounded-md font-semibold ${cell ? monthlyCellClass[cell.code] || "bg-slate-100 text-slate-600" : "text-slate-300"}`}>{cell?.code || "-"}</span></td>; })}</tr>)}</tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600"><span><b className="text-emerald-700">H</b> Hadir</span><span><b className="text-teal-700">SITE</b> Site</span><span><b className="text-amber-700">L</b> Terlambat</span><span><b className="text-sky-700">P</b> Pulang</span><span><b className="text-blue-700">I</b> Izin</span><span><b className="text-violet-700">S</b> Sakit</span><span><b className="text-rose-700">A</b> Alpha</span><span>- Belum ada data</span></div>
          {monthlyReport && monthlyReport.month === monthlyMonth && <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-emerald-50 text-slate-700"><tr><th className="px-4 py-3 font-semibold">Nama</th><th className="px-4 py-3 text-emerald-700">Hadir</th><th className="px-4 py-3 text-teal-700">Site</th><th className="px-4 py-3 text-amber-700">Terlambat</th><th className="px-4 py-3 text-rose-700">Alpha</th><th className="px-4 py-3 text-blue-700">Izin</th><th className="px-4 py-3 text-violet-700">Sakit</th><th className="px-4 py-3 text-emerald-800">Total Hadir</th><th className="px-4 py-3">Kehadiran</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{monthlySummaries.map((summary) => <tr key={summary.employee.id} className="hover:bg-slate-50"><th className="px-4 py-3 font-medium text-slate-800">{summary.employee.name}</th><td className="px-4 py-3 text-emerald-700">{summary.hadir}</td><td className="px-4 py-3 text-teal-700">{summary.site}</td><td className="px-4 py-3 text-amber-700">{summary.terlambat}</td><td className="px-4 py-3 text-rose-700">{summary.alpha}</td><td className="px-4 py-3 text-blue-700">{summary.izin}</td><td className="px-4 py-3 text-violet-700">{summary.sakit}</td><td className="px-4 py-3 font-semibold text-emerald-800">{summary.totalHadir}</td><td className="px-4 py-3 font-semibold">{summary.attendancePercent}%</td></tr>)}</tbody>
            </table>
          </div>}
        </section>

        {dailyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="daily-modal-title">
            <form onSubmit={handleAddDaily} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Input manual</p>
                  <h2 id="daily-modal-title" className="mt-1 text-xl font-bold text-slate-900">Tambah rekap harian</h2>
                </div>
                <button type="button" onClick={() => setDailyModalOpen(false)} className="text-2xl leading-none text-slate-400 hover:text-slate-700" aria-label="Tutup">×</button>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">Tanggal<input type="date" value={dailyDate} onChange={(event) => setDailyDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" required /></label>
                <label className="text-sm font-medium text-slate-700">Pegawai<select value={dailyEmployeeId} onChange={(event) => setDailyEmployeeId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" required><option value="">Pilih pegawai</option>{safeAttendance.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
                <label className="text-sm font-medium text-slate-700">Status<select value={dailyStatus} onChange={(event) => setDailyStatus(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"><option value="Site">Site</option><option value="Sakit">Sakit</option><option value="Izin">Izin</option><option value="Alpha">Alpha</option></select></label>
                <label className="text-sm font-medium text-slate-700">Jam masuk<input type="time" value={dailyTime} onChange={(event) => setDailyTime(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" /></label>
              </div>
              <label className="mt-4 block text-sm font-medium text-slate-700">Keterangan<textarea value={dailyNote} onChange={(event) => setDailyNote(event.target.value)} placeholder="Contoh: tugas luar, sakit, atau izin" className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2" /></label>
              <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setDailyModalOpen(false)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Batal</button><button type="submit" disabled={busy} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan"}</button></div>
            </form>
          </div>
        )}

        <section className="rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium text-indigo-600">Rekapan tahunan</p>
              <h2 className="text-xl font-bold text-slate-900">Rekapan tahun ajaran {safeAttendance.annualSummary?.year ?? new Date().getFullYear()}</h2>
            </div>
            <span className="text-xs text-slate-500">{annualWorkdays.length} hari kerja</span>
          </div>
          <div className="mt-4 max-h-[28rem] overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-3 font-semibold">Tanggal</th>
                  <th className="px-3 py-3 font-semibold">Scan</th>
                  <th className="px-3 py-3 font-semibold">Hadir</th>
                  <th className="px-3 py-3 font-semibold">Terlambat</th>
                  <th className="px-3 py-3 font-semibold">Pulang</th>
                  <th className="px-3 py-3 font-semibold">Izin</th>
                  <th className="px-3 py-3 font-semibold">Alpha</th>
                  <th className="px-3 py-3 text-center font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleAnnualWorkdays.map((day) => (
                  <tr key={day.date} className={day.date === safeAttendance.today ? "bg-emerald-50" : "hover:bg-slate-50"}>
                    <td className="px-3 py-2 font-medium text-slate-800">{new Date(`${day.date}T00:00:00Z`).toLocaleDateString("id-ID", { timeZone: "Asia/Makassar", weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="px-3 py-2 text-slate-600">{day.totalScans}</td>
                    <td className="px-3 py-2 text-emerald-700">{day.hadir}</td>
                    <td className="px-3 py-2 text-amber-700">{day.terlambat}</td>
                    <td className="px-3 py-2 text-sky-700">{day.pulang}</td>
                    <td className="px-3 py-2 text-blue-700">{day.izin}</td>
                    <td className="px-3 py-2 text-rose-700">{day.alpha}</td>
                    <td className="px-3 py-2 text-center">
                      <a
                        href={`/daily-summary?date=${day.date}`}
                        target="_blank"
                        rel="noreferrer"
                        title={`Lihat rekap ${day.date}`}
                        aria-label={`Lihat rekap ${day.date}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-50"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                          <circle cx="12" cy="12" r="2.5" />
                        </svg>
                      </a>
                      <a
                        href={`/api/attendance/export?date=${day.date}`}
                        download
                        title={`Download rekap ${day.date}`}
                        aria-label={`Download rekap ${day.date}`}
                        className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-50"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 3v12" />
                          <path d="m7 10 5 5 5-5" />
                          <path d="M5 21h14" />
                        </svg>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>Halaman {currentAnnualPage} dari {annualPageCount} ({annualWorkdays.length} hari kerja)</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAnnualPage((page) => Math.max(1, page - 1))}
                disabled={currentAnnualPage <= 1}
                className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Sebelumnya
              </button>
              {getPageItems(annualPageCount, currentAnnualPage).map((page, index) => page === "..." ? (
                <span key={`ellipsis-${index}`} className="flex h-10 min-w-10 items-center justify-center px-1 text-slate-400">...</span>
              ) : (
                <button
                  key={page}
                  type="button"
                  onClick={() => setAnnualPage(page)}
                  className={`h-10 min-w-10 rounded-full px-3 font-semibold ${page === currentAnnualPage ? "bg-indigo-600 text-white" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                  aria-current={page === currentAnnualPage ? "page" : undefined}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAnnualPage((page) => Math.min(annualPageCount, page + 1))}
                disabled={currentAnnualPage >= annualPageCount}
                className="rounded-full bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium text-slate-500">Manajemen pegawai</p>
              <h2 className="text-xl font-bold text-slate-900">Daftar pegawai aktif</h2>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">No</th>
                  <th className="px-4 py-3 font-semibold">Nama</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Departemen</th>
                  <th className="px-4 py-3 font-semibold">Bergabung</th>
                  <th className="px-4 py-3 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {safeAttendance.employees && safeAttendance.employees.length > 0 ? (
                  safeAttendance.employees.map((employee, idx) => (
                    <tr key={employee.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{employee.name}</td>
                      <td className="px-4 py-3 text-slate-600">{employee.email}</td>
                      <td className="px-4 py-3 text-slate-600">{employee.department}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(employee.createdAt).toLocaleDateString("id-ID", { timeZone: "Asia/Makassar" })}
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => handleDeleteEmployee(employee)} disabled={busy} className="text-xs font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-50">
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      Tidak ada pegawai terdaftar
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium text-slate-500">Fingerprint mappings</p>
              <h2 className="text-xl font-bold text-slate-900">Mapping template fingerprint ke pegawai</h2>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Template ID</th>
                  <th className="px-4 py-3 font-semibold">Device ID</th>
                  <th className="px-4 py-3 font-semibold">Pegawai</th>
                  <th className="px-4 py-3 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {safeAttendance.mappings && safeAttendance.mappings.length > 0 ? (
                  safeAttendance.mappings.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{m.templateId}</td>
                      <td className="px-4 py-3 text-slate-600">{m.deviceId || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {m.employeeId
                          ? (safeAttendance.employees.find((e) => e.id === m.employeeId)?.name || "-")
                          : (
                            <select defaultValue={String(safeAttendance.employees.find((employee) => employee.pendingFingerprintId === m.templateId)?.id ?? "")} onChange={(e) => { /* handled below */ }} className="rounded border px-2 py-1 text-sm">
                              <option value="">-- pilih pegawai --</option>
                              {safeAttendance.employees.map((emp) => (
                                <option key={emp.id} value={emp.id}>{emp.name} ({emp.department})</option>
                              ))}
                            </select>
                          )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            {m.employeeId ? "Sudah terhubung" : safeAttendance.employees.some((employee) => employee.pendingFingerprintId === m.templateId) ? "Menunggu Map" : "Belum dipetakan"}
                          </span>
                          {m.employeeId ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                const employeeName = safeAttendance.employees.find((employee) => employee.id === m.employeeId)?.name || "pegawai";
                                if (!window.confirm(`Hapus ${employeeName}, mapping ID ${m.templateId}, dan fingerprint dari ESP32?`)) return;
                                setBusy(true);
                                try {
                                  const response = await fetch("/api/attendance", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "deleteMapping", templateId: m.templateId }),
                                  });
                                  const data = await response.json();
                                  if (!response.ok) throw new Error(data.error || "Gagal menghapus mapping");
                                  setAttendance(data.state);
                                  setMsg("Pegawai, mapping, dan fingerprint ESP32 berhasil dihapus.");
                                  window.setTimeout(() => setMsg(null), 4000);
                                } catch (error) {
                                  setMsg(error instanceof Error ? error.message : "Gagal menghapus mapping");
                                } finally {
                                  setBusy(false);
                                }
                              }}
                              className="text-xs font-semibold text-rose-600 disabled:opacity-50"
                            >
                              Hapus ID + Pegawai
                            </button>
                          ) : (
                            <>
                              <button onClick={async (e) => { const sel = (e.currentTarget.parentElement!.parentElement!.previousElementSibling!.querySelector('select') as HTMLSelectElement); const empId = sel.value; if (!empId) return alert('Pilih pegawai'); setBusy(true); await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mapTemplate', templateId: m.templateId, employeeId: Number(empId) }) }); await fetchAttendance(); setBusy(false); }} className="rounded bg-emerald-600 px-3 py-1 text-xs text-white">Map</button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                  if (!window.confirm(`Hapus mapping ID ${m.templateId} dan fingerprint dari ESP32?`)) return;
                                  setBusy(true);
                                  try {
                                    const response = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteMapping", templateId: m.templateId }) });
                                    const data = await response.json();
                                    if (!response.ok) throw new Error(data.error || "Gagal menghapus mapping");
                                    setAttendance(data.state);
                                    setMsg("Mapping dan fingerprint ESP32 berhasil dihapus.");
                                    window.setTimeout(() => setMsg(null), 4000);
                                  } catch (error) {
                                    setMsg(error instanceof Error ? error.message : "Gagal menghapus mapping");
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                                className="text-xs font-semibold text-rose-600 disabled:opacity-50"
                              >
                                Hapus ID
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">Tidak ada mapping</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
