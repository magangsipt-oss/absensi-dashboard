"use client";

import { useEffect, useState, type FormEvent } from "react";

interface SerialConfig {
  portPath: string;
  baudRate: number;
  deviceName: string;
  isActive: boolean;
  status: string;
  lastChecked?: string;
}

export default function SerialSettings() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [config, setConfig] = useState<SerialConfig>({
    portPath: "COM7",
    baudRate: 115200,
    deviceName: "Arduino Fingerprint",
    isActive: false,
    status: "Unknown",
  });

  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fingerprintId, setFingerprintId] = useState("");
  const [storedFingerprintIds, setStoredFingerprintIds] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  useEffect(() => {
    setAuthenticated(window.localStorage.getItem("admin_authenticated") === "true");
    setAuthReady(true);
  }, []);

  const handleAdminLogin = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== "admin123") {
      setAuthError("Password admin salah.");
      return;
    }
    window.localStorage.setItem("admin_authenticated", "true");
    setAuthenticated(true);
    setAuthError("");
  };

  // Load current config on mount
  useEffect(() => {
    if (!authenticated) return;
    const fetchConfig = async () => {
      try {
        const response = await fetch("/api/serial-config");
        if (response.ok) {
          const text = await response.text();
          if (text) {
            const data = JSON.parse(text);
            setConfig(data);
          }
        }
      } catch (error) {
        console.error("Error loading config:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [authenticated]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setConfig((prev) => ({
      ...prev,
      [name]:
        name === "baudRate" ? parseInt(value, 10) : value,
    }));
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setMessage("");

    try {
      const response = await fetch("/api/serial-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "testConnection",
          portPath: config.portPath,
          baudRate: config.baudRate,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const text = await response.text();
      if (!text) {
        throw new Error("Empty response from server");
      }

      const data = JSON.parse(text);

      if (data.success) {
        setMessageType("success");
        setMessage(`✅ ${data.status} - Port terhubung dengan baik`);
      } else {
        setMessageType("error");
        setMessage(`❌ ${data.status}`);
      }
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Gagal melakukan test koneksi"
      );
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage("");

    try {
      const response = await fetch("/api/serial-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateConfig",
          portPath: config.portPath,
          baudRate: config.baudRate,
          deviceName: config.deviceName,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const text = await response.text();
      if (!text) {
        throw new Error("Empty response from server");
      }

      const data = JSON.parse(text);

      if (data.success) {
        setConfig(data.config);
        setMessageType("success");
        setMessage(`✅ ${data.message}`);
      } else {
        setMessageType("error");
        setMessage(data.error || "Gagal menyimpan konfigurasi");
      }
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Gagal menyimpan konfigurasi"
      );
    }
  };

  const handleDeleteFingerprint = async () => {
    const templateId = Number(fingerprintId);
    if (!Number.isInteger(templateId) || templateId < 1 || templateId > 127) {
      setMessageType("error");
      setMessage("Masukkan ID fingerprint antara 1 sampai 127.");
      return;
    }
    if (!window.confirm(`Hapus fingerprint ID ${templateId} dari ESP32?`)) return;

    setDeleting(true);
    setMessage("");
    try {
      const response = await fetch("/api/serial-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteFingerprintWifi", templateId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal menghapus fingerprint");
      setMessageType("success");
      setMessage(`Fingerprint ID ${templateId} berhasil dihapus dari ESP32.`);
      setFingerprintId("");
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Gagal menghapus fingerprint");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAllFingerprints = async () => {
    if (!window.confirm("Hapus SEMUA fingerprint yang tersimpan di ESP32? Tindakan ini tidak dapat dibatalkan.")) return;

    setDeleting(true);
    setMessage("");
    try {
      const response = await fetch("/api/serial-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteAllFingerprintsWifi" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal menghapus semua fingerprint");
      setMessageType("success");
      setMessage("Semua fingerprint di ESP32 berhasil dihapus.");
      setFingerprintId("");
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Gagal menghapus semua fingerprint");
    } finally {
      setDeleting(false);
    }
  };

  const handleListFingerprints = async () => {
    setTesting(true);
    setMessage("");
    try {
      const response = await fetch("/api/serial-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listFingerprintsWifi" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal membaca ID fingerprint");
      setStoredFingerprintIds(data.ids || []);
      setMessageType("success");
      setMessage(`${(data.ids || []).length} ID fingerprint ditemukan di ESP32.`);
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Gagal membaca ID fingerprint");
    } finally {
      setTesting(false);
    }
  };

  if (!authReady) {
    return <div className="flex min-h-screen items-center justify-center bg-[#120e16] p-6 text-white">Memuat...</div>;
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8 text-slate-100">
        <div className="w-full max-w-md rounded-[28px] border border-slate-700 bg-slate-900/90 p-6 shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-emerald-300">Admin</p>
          <h1 className="mt-3 text-3xl font-bold text-white">Akses konfigurasi perangkat</h1>
          <p className="mt-3 text-sm text-slate-400">Masukkan password admin untuk membuka pengaturan serial dan fingerprint ESP32.</p>
          <form onSubmit={handleAdminLogin} className="mt-6 space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password admin"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-400"
            />
            {authError && <p className="text-sm text-rose-300">{authError}</p>}
            <button type="submit" className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 hover:bg-emerald-400">
              Masuk
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (loading) {
    return <div className="text-center py-8">Memuat konfigurasi...</div>;
  }

  return (
    <div className="min-h-screen bg-[#120e16] bg-[url('/attendance-background.svg')] bg-cover bg-center bg-fixed p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-6">Konfigurasi Arduino Serial</h2>

        {/* Status Card */}
        <div
          className={`mb-6 p-4 rounded-lg ${
            config.isActive
              ? "bg-green-100 border border-green-300"
              : "bg-yellow-100 border border-yellow-300"
          }`}
        >
          <div className="font-semibold text-lg">Status: {config.status}</div>
          {config.lastChecked && (
            <div className="text-sm text-gray-600">
              Terakhir cek: {new Date(config.lastChecked).toLocaleString("id-ID")}
            </div>
          )}
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              messageType === "success"
                ? "bg-green-100 text-green-800 border border-green-300"
                : "bg-red-100 text-red-800 border border-red-300"
            }`}
          >
            {message}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Serial Port (COM7, /dev/ttyUSB0, etc)
            </label>
            <input
              type="text"
              name="portPath"
              value={config.portPath}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="COM7"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Baud Rate
            </label>
            <select
              name="baudRate"
              value={config.baudRate}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={9600}>9600</option>
              <option value={14400}>14400</option>
              <option value={19200}>19200</option>
              <option value={38400}>38400</option>
              <option value={57600}>57600</option>
              <option value={115200}>115200</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Nama Device
            </label>
            <input
              type="text"
              name="deviceName"
              value={config.deviceName}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Arduino Fingerprint"
            />
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              {testing ? "Menguji..." : "🔗 Test Koneksi"}
            </button>

            <button
              type="submit"
              className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              💾 Simpan Konfigurasi
            </button>
          </div>
        </form>

        <section className="mt-8 border-t border-gray-200 pt-6">
          <h3 className="mb-2 text-lg font-semibold">ID fingerprint tersimpan di ESP32</h3>
          <p className="mb-4 text-sm text-gray-600">Daftar ini dibaca langsung dari memori sensor melalui Wi-Fi.</p>
          <button
            type="button"
            onClick={handleListFingerprints}
            disabled={testing}
            className="w-full rounded-lg bg-slate-800 px-4 py-2 font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? "Membaca..." : "Muat ID dari ESP32"}
          </button>
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {storedFingerprintIds.length > 0 ? storedFingerprintIds.join(", ") : "Belum ada daftar ID. Klik tombol untuk membaca sensor."}
          </div>

          <h3 className="mb-2 mt-6 text-lg font-semibold">Hapus ID fingerprint di ESP32</h3>
          <p className="mb-4 text-sm text-gray-600">
            Masukkan ID fingerprint yang ingin dihapus dari memori sensor. ID harus berada pada rentang 1 sampai 127.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="number"
              min="1"
              max="127"
              value={fingerprintId}
              onChange={(e) => setFingerprintId(e.target.value)}
              placeholder="Contoh: 12"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 sm:flex-1"
            />
            <button
              type="button"
              onClick={handleDeleteFingerprint}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {deleting ? "Menghapus..." : "Hapus ID"}
            </button>
          </div>
          <button
            type="button"
            onClick={handleDeleteAllFingerprints}
            disabled={deleting}
            className="mt-3 w-full rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Hapus Semua Fingerprint di ESP32
          </button>
        </section>

        {/* Help Section */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold mb-3">📝 Informasi Serial Port</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>
              <strong>COM7:</strong> Serial port di Windows (bisa berbeda tergantung device)
            </li>
            <li>
              <strong>/dev/ttyUSB0:</strong> Serial port di Linux
            </li>
            <li>
              <strong>/dev/cu.usbserial-*:</strong> Serial port di macOS
            </li>
            <li>
              <strong>Baud Rate 115200:</strong> Kecepatan komunikasi dengan Arduino (standard)
            </li>
          </ul>

          <h4 className="text-md font-semibold mt-4 mb-2">📍 Cara Menemukan Serial Port:</h4>
          <div className="bg-gray-100 p-3 rounded text-sm space-y-2">
            <p><strong>Windows (Device Manager):</strong></p>
            <ul className="ml-4 list-disc">
              <li>Buka Device Manager</li>
              <li>Cari "COM & LPT Ports"</li>
              <li>Catat nomor port (contoh: COM7)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
