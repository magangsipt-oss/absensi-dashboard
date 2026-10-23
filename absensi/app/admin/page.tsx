"use client";

import { useEffect, useState } from "react";

interface AttendanceRecord {
  id: number;
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
  totalScans: number;
  hadir: number;
  terlambat: number;
  pulang: number;
  izin: number;
  sakit: number;
  alpha: number;
  attendees: Array<{ name: string; status: string }>;
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

export default function AdminPage() {
  const [attendance, setAttendance] = useState<AttendanceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("Semua");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const [fingerprintListener, setFingerprintListener] = useState("Menyiapkan listener fingerprint...");
  const [mappingMessage, setMappingMessage] = useState<string | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<Record<number, string>>({});

  const fetchAttendance = async () => {
    try {
      const response = await fetch("/api/attendance");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Gagal memuat data absensi");
      }
      if (
        !Array.isArray(data.records) ||
        !Array.isArray(data.employees) ||
        !Array.isArray(data.mappings)
      ) {
        throw new Error("Respons server tidak berisi data absensi yang valid.");
      }
      setAttendance(data);
      setDataLoadError(null);
    } catch (err) {
      console.error(err);
      setDataLoadError("Data absensi gagal dimuat. Data yang tidak tampil belum tentu terhapus. Periksa koneksi database, lalu coba muat ulang.");
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
    if (!window.confirm("Hapus satu catatan absensi ini secara permanen?")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deleteRecord",
          recordId,
          confirmation: "DELETE_SINGLE_ATTENDANCE_RECORD",
        }),
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

  const syncSensorTemplates = async () => {
    setBusy(true);
    setMappingMessage(null);
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "syncSensorTemplates" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal menyinkronkan template ESP32");
      await fetchAttendance();
      setMappingMessage(
        result.queued
          ? "Permintaan sinkronisasi dikirim. ESP32 akan mengirim ID yang tersimpan saat online; daftar diperbarui otomatis."
          : `${result.syncedCount} template dari ESP32 berhasil disinkronkan. Pilih pegawai untuk mengisi mapping.`
      );
    } catch (error) {
      setMappingMessage(error instanceof Error ? error.message : "Gagal menyinkronkan template ESP32");
    } finally {
      setBusy(false);
    }
  };

  const updateTemplateMapping = async (templateId: number, employeeId: number | null) => {
    setBusy(true);
    setMappingMessage(null);
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mapTemplate", templateId, employeeId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal memperbarui mapping");
      await fetchAttendance();
      setSelectedEmployees((current) => ({ ...current, [templateId]: "" }));
    } catch (error) {
      setMappingMessage(error instanceof Error ? error.message : "Gagal memperbarui mapping");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchAttendance();
    }, 0);

    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

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
      } catch {
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
    } catch {
      // ignore device-list load failures in admin background state
    }
  };

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchDevices();
    }, 0);
    return () => window.clearTimeout(id);
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
      } catch {
        // ignore
      }
    };
    const id = window.setTimeout(() => {
      void fetchInfo();
    }, 0);
    return () => window.clearTimeout(id);
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
    today: new Date().toISOString().split("T")[0],
    records: [],
    employees: [],
    mappings: [],
    verificationLogs: [],
    annualSummary: { year: new Date().getFullYear(), workdays: [] },
  };

  const todaySummary = safeAttendance.annualSummary?.workdays.find((day) => day.date === safeAttendance.today);
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
        {dataLoadError && (
          <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            {dataLoadError}
            <button onClick={() => void fetchAttendance()} className="ml-2 font-semibold underline">
              Coba lagi
            </button>
          </div>
        )}

        {!attendance ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950" role="status">
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="mt-2">
              {loading ? "Memuat data absensi..." : "Data belum tersedia. Ringkasan kosong tidak ditampilkan agar tidak disalahartikan sebagai data terhapus."}
            </p>
            {!loading && (
              <button
                onClick={() => void fetchAttendance()}
                className="mt-4 rounded-lg bg-amber-800 px-4 py-2 font-semibold text-white"
              >
                Coba muat ulang
              </button>
            )}
          </section>
        ) : (
          <>
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
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <a href={`/daily-summary?date=${safeAttendance.today}`} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700">
              Rekap harian
            </a>
            <a href="/monthly-summary" className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50">
              Rekap bulanan
            </a>
            <a href="/annual-summary" className="rounded-full border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50">
              Rekap tahunan
            </a>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium text-emerald-700">Rekap harian</p>
              <h2 className="text-xl font-bold text-slate-900">Ringkasan kehadiran hari ini</h2>
              <p className="mt-1 text-sm text-slate-600">{safeAttendance.today}</p>
            </div>
            <a href={`/daily-summary?date=${safeAttendance.today}`} className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100">
              Lihat detail harian
            </a>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Hadir", todaySummary?.hadir ?? stats.Hadir],
              ["Terlambat", todaySummary?.terlambat ?? stats.Terlambat],
              ["Pulang", todaySummary?.pulang ?? 0],
              ["Izin / Sakit", (todaySummary?.izin ?? 0) + (todaySummary?.sakit ?? 0)],
              ["Alpha", todaySummary?.alpha ?? 0],
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
                {todaySummary?.attendees.length
                  ? todaySummary.attendees.map((person) => `${person.name} (${person.status})`).join(", ")
                  : "Belum ada pegawai hadir"}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white p-4">
              <p className="text-sm font-semibold text-slate-700">Pegawai alpha</p>
              <p className="mt-2 text-sm text-slate-600">
                {todaySummary?.absentEmployees.length
                  ? todaySummary.absentEmployees.join(", ")
                  : "Tidak ada data alpha"}
              </p>
            </div>
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

        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <p className="text-sm font-medium text-blue-700">Status penerimaan fingerprint</p>
          <p className="mt-1 font-semibold text-slate-900">{fingerprintListener}</p>
          <p className="mt-1 text-xs text-blue-800">Tempelkan jari pada sensor. Admin akan memperbarui data absensi otomatis.</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium text-slate-500">Riwayat verifikasi</p>
              <h2 className="text-xl font-bold text-slate-900">Log sidik jari AS608</h2>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">No</th>
                  <th className="px-4 py-3 font-semibold">Nama</th>
                  <th className="px-4 py-3 font-semibold">Device</th>
                  <th className="px-4 py-3 font-semibold">Template ID</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Waktu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {safeAttendance.verificationLogs && safeAttendance.verificationLogs.length > 0 ? (
                  safeAttendance.verificationLogs.map((log, idx) => {
                    const employee = log.employeeId ? safeAttendance.employees.find((e) => e.id === log.employeeId) : null;
                    return (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{idx + 1}</td>
                        <td className="px-4 py-3 text-slate-700">{employee?.name || "Belum dipetakan"}</td>
                        <td className="px-4 py-3 text-slate-600">{log.deviceId || "-"}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{log.templateId}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            log.status === "Berhasil"
                              ? "bg-emerald-100 text-emerald-700"
                              : log.status.includes("Duplikat")
                                ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-700"
                          }`}>
                            {log.status === "Berhasil" ? "Berhasil absen" : log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{new Date(log.verifiedAt).toLocaleString("id-ID")}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      Belum ada log verifikasi sidik jari
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
              <p className="text-sm font-medium text-slate-500">Rekaman terbaru</p>
              <h2 className="text-xl font-bold text-slate-900">Semua data absensi</h2>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold outline-none focus:border-emerald-400"
              >
                <option>Semua</option>
                <option>Hadir</option>
                <option>Terlambat</option>
                <option>Izin</option>
                <option>Alpha</option>
              </select>
              <button
                onClick={handleExport}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Export CSV
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">No</th>
                  <th className="px-4 py-3 font-semibold">Nama</th>
                  <th className="px-4 py-3 font-semibold">Jam</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Catatan</th>
                  <th className="px-4 py-3 font-semibold">Waktu</th>
                  <th className="px-4 py-3 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredRecords.length > 0 ? (
                  filteredRecords.map((record, idx) => (
                    <tr key={record.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{record.name}</td>
                      <td className="px-4 py-3 text-slate-600">{record.time}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            record.status === "Hadir"
                              ? "bg-emerald-100 text-emerald-700"
                              : record.status === "Terlambat"
                                ? "bg-amber-100 text-amber-700"
                                : record.status === "Izin"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {record.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{record.note}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(record.checkedAt).toLocaleString("id-ID")}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDeleteRecord(record.id)}
                          disabled={busy}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                      Tidak ada data absensi
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
                        {new Date(employee.createdAt).toLocaleDateString("id-ID")}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
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
            <button
              onClick={syncSensorTemplates}
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Memproses..." : "Sinkronkan dari ESP32"}
            </button>
          </div>
          {mappingMessage && (
            <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800" role="status">
              {mappingMessage}
            </p>
          )}
          <p className="mt-3 text-sm text-slate-600">
            Sidik jari yang sudah tersimpan di sensor belum otomatis terhubung ke pegawai. Setelah
            sinkronisasi ESP32, ID yang sudah ditandai sebagai fingerprint tertunda pada pegawai
            akan dicocokkan otomatis. Untuk ID lain, pilih pegawai yang benar pada baris “Belum
            di-map”, lalu tekan “Map” sebelum pegawai mencoba absen.
          </p>

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
                {!attendance ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-amber-800">
                      Mapping tidak dapat ditampilkan karena data gagal dimuat. Baris kosong ini bukan bukti mapping terhapus.
                    </td>
                  </tr>
                ) : safeAttendance.mappings && safeAttendance.mappings.length > 0 ? (
                  safeAttendance.mappings.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{m.templateId}</td>
                      <td className="px-4 py-3 text-slate-600">{m.deviceId || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {m.employeeId
                          ? (safeAttendance.employees.find((e) => e.id === m.employeeId)?.name || "-")
                          : (
                            <select
                              value={selectedEmployees[m.templateId] || ""}
                              onChange={(e) => setSelectedEmployees((current) => ({ ...current, [m.templateId]: e.target.value }))}
                              className="rounded border px-2 py-1 text-sm"
                            >
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
                            {m.employeeId ? "Sudah terhubung" : "Belum di-map"}
                          </span>
                          {m.employeeId ? (
                            <button
                              onClick={() => updateTemplateMapping(m.templateId, null)}
                              disabled={busy}
                              className="text-xs font-semibold text-rose-600 disabled:opacity-50"
                            >
                              Unmap
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                const employeeId = Number(selectedEmployees[m.templateId]);
                                if (!employeeId) {
                                  setMappingMessage("Pilih pegawai terlebih dahulu.");
                                  return;
                                }
                                void updateTemplateMapping(m.templateId, employeeId);
                              }}
                              disabled={busy}
                              className="rounded bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-50"
                            >
                              Map
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      Belum ada template tersinkron. Klik “Sinkronkan dari ESP32”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
          </>
        )}
      </main>
    </div>
  );
}
