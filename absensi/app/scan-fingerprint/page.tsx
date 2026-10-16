"use client";

import { useState } from "react";

export default function FingerprintScanner() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{
    id?: string;
    error?: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  const handleScan = async () => {
    setScanning(true);
    setMessage("");
    setResult(null);

    try {
      const response = await fetch("/api/serial-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "scanFingerprint",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const text = await response.text();
      if (!text) {
        throw new Error("Empty response from server");
      }

      const data = JSON.parse(text);

      if (data.success) {
        setMessageType("success");
        setMessage(`✅ Berhasil! Fingerprint ID: ${data.fingerprintId}`);
        setResult({ id: data.fingerprintId });
      } else {
        setMessageType("error");
        setMessage(`❌ ${data.error || "Scan gagal"}`);
        setResult({ error: data.error });
      }
    } catch (error) {
      setMessageType("error");
      const errorMsg =
        error instanceof Error ? error.message : "Scan gagal";
      setMessage(`❌ ${errorMsg}`);
      setResult({ error: errorMsg });
      console.error("Scan error:", error);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-center mb-6">
          👆 Fingerprint Scanner
        </h1>

        <button
          onClick={handleScan}
          disabled={scanning}
          className={`w-full py-4 px-6 rounded-lg font-bold text-white text-lg transition ${
            scanning
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600 active:scale-95"
          }`}
        >
          {scanning ? "⏳ Scanning..." : "🔘 Scan Fingerprint"}
        </button>

        {message && (
          <div
            className={`mt-6 p-4 rounded-lg text-center font-semibold ${
              messageType === "success"
                ? "bg-green-100 text-green-800 border border-green-300"
                : "bg-red-100 text-red-800 border border-red-300"
            }`}
          >
            {message}
          </div>
        )}

        {result?.id && (
          <div className="mt-6 p-4 bg-blue-100 border border-blue-300 rounded-lg">
            <p className="text-sm text-gray-600">Fingerprint ID Terdeteksi:</p>
            <p className="text-3xl font-bold text-blue-600 text-center">
              {result.id}
            </p>
          </div>
        )}

        {/* Info */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-600 text-center">
            Pastikan Arduino sudah terhubung ke COM7 sebelum scan
          </p>
        </div>
      </div>
    </div>
  );
}
