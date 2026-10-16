"use client";

import { useEffect, useState } from "react";

interface ArduinoConfig {
  deviceId: string;
  ipAddress: string;
  port: number;
  isActive: boolean;
  status: string;
  lastChecked?: string;
}

export default function ArduinoSettings() {
  const [config, setConfig] = useState<ArduinoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  // Form state
  const [deviceId, setDeviceId] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [port, setPort] = useState(3000);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch("/api/arduino-config");
      const data = await response.json();
      setConfig(data);
      setDeviceId(data.deviceId);
      setIpAddress(data.ipAddress);
      setPort(data.port);
    } catch (error) {
      console.error("Error loading config:", error);
      setMessage("Gagal memuat konfigurasi");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!ipAddress.trim()) {
      setMessage("IP Address harus diisi");
      setMessageType("error");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/arduino-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          deviceId: deviceId || "ESP32-01",
          ipAddress,
          port,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setConfig(data.config);
        setMessage(data.message);
        setMessageType("success");
      } else {
        setMessage(data.error || "Gagal menyimpan konfigurasi");
        setMessageType("error");
      }
    } catch (error) {
      console.error("Error saving config:", error);
      setMessage("Terjadi kesalahan");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!ipAddress.trim()) {
      setMessage("IP Address harus diisi");
      setMessageType("error");
      return;
    }

    setTesting(true);
    try {
      const response = await fetch("/api/arduino-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "testConnection",
          ipAddress,
          port,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage(`Status koneksi: ${data.status}`);
        setMessageType(data.status === "Connected" ? "success" : "error");
      } else {
        setMessage(data.error || "Gagal test koneksi");
        setMessageType("error");
      }
    } catch (error) {
      console.error("Error testing connection:", error);
      setMessage("Terjadi kesalahan saat test koneksi");
      setMessageType("error");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <p className="text-gray-600">Memuat konfigurasi Arduino...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Konfigurasi Arduino</h2>
        <p className="mt-1 text-sm text-gray-600">
          Atur IP address dan port Arduino/ESP32 untuk integrasi sidik jari
        </p>
      </div>

      {/* Message Alert */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            messageType === "success"
              ? "bg-green-50 border border-green-200"
              : "bg-red-50 border border-red-200"
          }`}
        >
          <p
            className={
              messageType === "success" ? "text-green-800" : "text-red-800"
            }
          >
            {message}
          </p>
        </div>
      )}

      {/* Status Card */}
      {config && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Status Koneksi
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <p className="mt-1 text-lg font-semibold">
                <span
                  className={
                    config.status === "Connected"
                      ? "text-green-600"
                      : config.status === "Offline"
                      ? "text-red-600"
                      : "text-yellow-600"
                  }
                >
                  {config.status}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Terakhir Dicheck</p>
              <p className="mt-1 text-sm">
                {config.lastChecked
                  ? new Date(config.lastChecked).toLocaleString("id-ID")
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Perangkat ID</p>
              <p className="mt-1 font-mono text-sm">{config.deviceId}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Alamat</p>
              <p className="mt-1 font-mono text-sm">
                {config.ipAddress}:{config.port}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Atur Konfigurasi
        </h3>

        <div>
          <label className="block text-sm font-medium text-gray-900">
            Device ID
          </label>
          <input
            type="text"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            placeholder="Contoh: ESP32-01"
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Identitas unik untuk perangkat Arduino/ESP32
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900">
            IP Address Arduino
          </label>
          <input
            type="text"
            value={ipAddress}
            onChange={(e) => setIpAddress(e.target.value)}
            placeholder="Contoh: 192.168.1.100"
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Alamat IP lokal Arduino/ESP32 di jaringan Anda
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900">
            Port
          </label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(parseInt(e.target.value) || 3000)}
            placeholder="3000"
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Port yang digunakan Arduino (default: 3000)
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={handleTestConnection}
            disabled={testing || !ipAddress}
            className="flex-1 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {testing ? "Testing..." : "Test Koneksi"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !ipAddress}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {saving ? "Menyimpan..." : "Simpan Konfigurasi"}
          </button>
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">
          📖 Cara Mencari IP Arduino
        </h3>
        <ol className="space-y-2 text-sm text-blue-800 list-decimal list-inside">
          <li>
            Buka Serial Monitor di Arduino IDE dengan baud rate <code className="bg-blue-100 px-1 rounded">115200</code>
          </li>
          <li>
            Cari baris yang berisi <code className="bg-blue-100 px-1 rounded">IP: 192.168.x.x</code> di output
          </li>
          <li>
            Salin IP tersebut dan masukkan ke field di atas
          </li>
          <li>
            Klik tombol "Test Koneksi" untuk memverifikasi
          </li>
        </ol>
      </div>
    </div>
  );
}
