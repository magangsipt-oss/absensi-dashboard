import { NextResponse } from "next/server";
import {
  getSerialConnectionError,
  getSerialInstance,
  getSerialModuleError,
  testSerialConnection,
} from "../../../lib/serial-communication";
import fs from "fs";
import path from "path";

let serialOperation: Promise<void> = Promise.resolve();
let continuousScanEnabled = false;

async function withSerialLock<T>(operation: () => Promise<T>): Promise<T> {
  const previousOperation = serialOperation;
  let releaseOperation!: () => void;
  serialOperation = new Promise<void>((resolve) => {
    releaseOperation = resolve;
  });
  await previousOperation;
  try {
    return await operation();
  } finally {
    releaseOperation();
  }
}

const configFile = path.join(process.cwd(), "data", "serial-config.json");

// Ensure data directory exists
if (!fs.existsSync(path.join(process.cwd(), "data"))) {
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
}

interface SerialConfig {
  portPath: string; // COM7, /dev/ttyUSB0, etc
  baudRate: number; // 115200
  deviceName: string; // "Fingerprint Scanner"
  isActive: boolean;
  status: string;
  lastChecked?: string;
  targetUrl?: string;
  targetApiKey?: string;
  autoForwardData?: boolean;
}

function getConfig(): SerialConfig {
  try {
    if (fs.existsSync(configFile)) {
      const data = fs.readFileSync(configFile, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading config:", error);
  }

  // Default config for Arduino on COM7
  return {
    portPath: "COM7",
    baudRate: 115200,
    deviceName: "Arduino Fingerprint",
    isActive: false,
    status: "Unknown",
  };
}

function saveConfig(config: SerialConfig): void {
  try {
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Error saving config:", error);
  }
}

async function waitForDeviceReady(serial: ReturnType<typeof getSerialInstance>): Promise<void> {
  await serial.waitForLine((line) => line === "DEVICE_READY", 30000);
}

function extractFingerprintId(response: string): string {
  const normalized = response.trim();
  if (!normalized) return "";

  const protocolMatch = normalized.match(/^(?:FINGERPRINT_ID|ENROLL_OK)\s*:\s*([0-9]+)$/i);
  if (protocolMatch) return protocolMatch[1];

  try {
    const payload = JSON.parse(normalized) as { fingerprintId?: unknown; id?: unknown };
    const id = payload.fingerprintId ?? payload.id;
    if (typeof id === "string" || typeof id === "number") return String(id).trim();
  } catch {
    // The scanner normally returns plain text, so JSON is optional.
  }

  const match = normalized.match(/(?:fingerprint[_ ]?(?:id)?|template[_ ]?(?:id)?|id)\s*[:=]\s*([A-Za-z0-9_-]+)/i);
  const candidate = (match?.[1] ?? normalized).trim();
  return /^\d+$/.test(candidate) ? candidate : "";
}

export async function GET() {
  try {
    const config = getConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error("Error in GET /api/serial-config:", error);
    return NextResponse.json(
      {
        portPath: "COM7",
        baudRate: 115200,
        deviceName: "Arduino Fingerprint",
        isActive: false,
        status: "Unknown",
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === "updateConfig") {
      try {
        const { portPath, baudRate, deviceName } = body;

        if (!portPath) {
          return NextResponse.json(
            { error: "Serial port path harus diisi" },
            { status: 400 }
          );
        }

        // Test connection
        const connected = await testSerialConnection({
          portPath,
          baudRate: baudRate || 115200,
        });

        const previousConfig = getConfig();
        const config: SerialConfig = {
          portPath,
          baudRate: baudRate || 115200,
          deviceName: deviceName || "Arduino Device",
          isActive: connected,
          status: connected ? "Connected" : "Connection Failed",
          lastChecked: new Date().toISOString(),
          targetUrl: previousConfig.targetUrl || "",
          targetApiKey: previousConfig.targetApiKey || "",
          autoForwardData: previousConfig.autoForwardData || false,
        };

        saveConfig(config);

        return NextResponse.json({
          success: true,
          config,
          message: `Konfigurasi disimpan. Status: ${config.status}`,
        });
      } catch (error) {
        console.error("Error in updateConfig:", error);
        return NextResponse.json(
          { error: "Gagal mengupdate konfigurasi" },
          { status: 500 }
        );
      }
    }

    if (body.action === "testConnection") {
      try {
        const { portPath, baudRate } = body;

        if (!portPath) {
          return NextResponse.json(
            { error: "Serial port path harus diisi" },
            { status: 400 }
          );
        }

        const connected = await testSerialConnection({
          portPath,
          baudRate: baudRate || 115200,
        });

        return NextResponse.json({
          success: connected,
          status: connected ? "Connected" : "Connection Failed",
          portPath,
          baudRate: baudRate || 115200,
        });
      } catch (error) {
        console.error("Error in testConnection:", error);
        return NextResponse.json(
          { error: "Gagal test koneksi" },
          { status: 500 }
        );
      }
    }

    if (body.action === "scanFingerprint" || body.action === "registerFingerprint") {
      return await withSerialLock(async () => {
        const serial = getSerialInstance();
        const isRegistration = body.action === "registerFingerprint";
        try {
        const config = getConfig();

        // If not already connected, connect now
        if (!serial.isConnected()) {
          const connected = await serial.connect({
            portPath: config.portPath,
            baudRate: config.baudRate,
          });

          if (!connected) {
            const connectionError = getSerialConnectionError() || "";
            return NextResponse.json(
              {
                error: getSerialModuleError()
                  ? "Modul serialport belum tersedia. Instal/rebuild binding native serialport terlebih dahulu."
                  : /access denied/i.test(connectionError)
                    ? `Port ${config.portPath} sedang digunakan aplikasi lain. Tutup Arduino Serial Monitor atau aplikasi yang memakai port tersebut.`
                    : `Gagal terhubung ke Arduino pada ${config.portPath}`,
              },
              { status: 500 }
            );
          }

          await waitForDeviceReady(serial);
          saveConfig({
            ...config,
            isActive: true,
            status: "Connected",
            lastChecked: new Date().toISOString(),
          });
        }

        // Opening a USB serial port can reset the ESP32. The physical button
        // starts the operation; the web only listens for its result.
          await new Promise((resolve) => setTimeout(resolve, 300));
        const response = await serial.waitForLine(
          (line) => line.startsWith("FINGERPRINT_ID:") || line.startsWith("ENROLL_OK:") || line.startsWith("SCAN_ERROR") || line.startsWith("ENROLL_ERROR"),
          continuousScanEnabled ? 1500 : 30000
        );
        const fingerprintId = extractFingerprintId(response);

        if (!fingerprintId) {
          return NextResponse.json(
            { error: response === "SCAN_ERROR"
              ? "Sidik jari tidak dikenali. Tempelkan jari yang sudah terdaftar dan coba lagi."
              : response.startsWith("ENROLL_ERROR")
                ? `Pendaftaran gagal: ${response.replace("ENROLL_ERROR:", "")}`
              : `Arduino mengirim respons tidak dikenal: ${response}` },
            { status: 502 }
          );
        }

        if (isRegistration || body.registerOnly === true) {
          return NextResponse.json({
            success: true,
            registrationOnly: true,
            fingerprintId,
            message: `Fingerprint terbaca: ${fingerprintId}`,
          });
        }

        const forwardResponse = await fetch(new URL("/api/fingerprint-forward", request.url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fingerprintId,
            deviceName: config.deviceName,
            timestamp: new Date().toISOString(),
            source: "serial-scanner",
          }),
        });
        const forwardResult = (await forwardResponse.json()) as {
          success?: boolean;
          message?: string;
          error?: string;
          employeeName?: string;
          attendanceId?: number;
          skipped?: boolean;
        };

        if (!forwardResponse.ok && forwardResponse.status !== 404) {
          return NextResponse.json(
            {
              error: forwardResult.error || "Fingerprint terbaca, tetapi gagal disimpan",
              fingerprintId,
              saved: false,
            },
            { status: 502 }
          );
        }

        return NextResponse.json({
          success: forwardResponse.ok && forwardResult.success === true,
          fingerprintId,
          saved: forwardResponse.ok && forwardResult.success === true,
          employeeName: forwardResult.employeeName,
          attendanceId: forwardResult.attendanceId,
          skipped: forwardResult.skipped,
          message: forwardResult.message || `Fingerprint terbaca: ${fingerprintId}`,
          error: forwardResult.error,
        });
        } catch (error) {
        const message =
          error instanceof Error ? error.message : "Scan gagal";
        console.error("Error in scanFingerprint:", error);
        return NextResponse.json(
          { error: message },
          { status: 500 }
        );
        } finally {
          if (isRegistration) continuousScanEnabled = false;
          if (!continuousScanEnabled) await serial.disconnect();
        }
      });
    }

    if (body.action === "setScanMode") {
      return await withSerialLock(async () => {
        const serial = getSerialInstance();
        const enabled = body.enabled === true;
        if (enabled && continuousScanEnabled) {
          return NextResponse.json({ success: true, enabled: true, alreadyActive: true });
        }
        try {
          const config = getConfig();
          if (!serial.isConnected()) {
            const connected = await serial.connect({ portPath: config.portPath, baudRate: config.baudRate });
            if (!connected) {
              return NextResponse.json({ error: `Gagal terhubung ke Arduino pada ${config.portPath}` }, { status: 500 });
            }
            await waitForDeviceReady(serial);
          }
          await new Promise((resolve) => setTimeout(resolve, 300));
          const response = await serial.sendCommandUntil(enabled ? "START_SCAN" : "STOP_SCAN", enabled ? "SCAN_MODE_ON" : "SCAN_MODE_OFF");
          if (response !== (enabled ? "SCAN_MODE_ON" : "SCAN_MODE_OFF")) {
            return NextResponse.json({ error: `ESP32 menolak mode scan: ${response}` }, { status: 502 });
          }
          continuousScanEnabled = enabled;
          if (!enabled) await serial.disconnect();
          return NextResponse.json({ success: true, enabled });
        } catch (error) {
          return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal mengubah mode scan" }, { status: 500 });
        } finally {
          if (!enabled && serial.isConnected()) await serial.disconnect();
        }
      });
    }

    if (body.action === "deleteFingerprint") {
      return await withSerialLock(async () => {
        const serial = getSerialInstance();
        const templateId = Number(body.templateId);
        if (!Number.isInteger(templateId) || templateId < 1 || templateId > 127) {
          return NextResponse.json({ error: "Template ID harus 1 sampai 127" }, { status: 400 });
        }

        try {
          const config = getConfig();
          if (!serial.isConnected()) {
            const connected = await serial.connect({ portPath: config.portPath, baudRate: config.baudRate });
            if (!connected) {
              return NextResponse.json({ error: `Gagal terhubung ke Arduino pada ${config.portPath}` }, { status: 500 });
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const response = await serial.sendCommandUntil(`DELETE ${templateId}`, "DELETE_");
          if (response !== `DELETE_OK:${templateId}`) {
            return NextResponse.json({ error: `Gagal menghapus template dari sensor: ${response}` }, { status: 502 });
          }
          return NextResponse.json({ success: true, templateId });
        } catch (error) {
          return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghapus fingerprint" }, { status: 500 });
        } finally {
          await serial.disconnect();
        }
      });
    }

    if (body.action === "deleteAllFingerprints") {
      return await withSerialLock(async () => {
        const serial = getSerialInstance();
        try {
          const config = getConfig();
          if (!serial.isConnected()) {
            const connected = await serial.connect({ portPath: config.portPath, baudRate: config.baudRate });
            if (!connected) {
              return NextResponse.json({ error: `Gagal terhubung ke Arduino pada ${config.portPath}` }, { status: 500 });
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const response = await serial.sendCommandUntil("DELETE ALL", "DELETE_ALL_");
          if (response !== "DELETE_ALL_OK") {
            return NextResponse.json({ error: `Gagal menghapus semua fingerprint dari sensor: ${response}` }, { status: 502 });
          }
          return NextResponse.json({ success: true });
        } catch (error) {
          return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghapus semua fingerprint" }, { status: 500 });
        } finally {
          await serial.disconnect();
        }
      });
    }

    return NextResponse.json(
      { error: "Action tidak dikenali" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in serial config POST:", error);
    return NextResponse.json(
      { error: "Gagal memproses request" },
      { status: 500 }
    );
  }
}
