import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { parseConnectionStatus } from "../../../lib/connection-status.js";

const configFile = path.join(process.cwd(), "data", "arduino-config.json");

// Ensure data directory exists
if (!fs.existsSync(path.join(process.cwd(), "data"))) {
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
}

interface ArduinoConfig {
  deviceId: string;
  ipAddress: string;
  port: number;
  isActive: boolean;
  status: string;
  lastChecked?: string;
}

function getConfig(): ArduinoConfig {
  try {
    if (fs.existsSync(configFile)) {
      const data = fs.readFileSync(configFile, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading config:", error);
  }
  
  // Default config
  return {
    deviceId: "ESP32-01",
    ipAddress: "192.168.1.100",
    port: 3000,
    isActive: false,
    status: "Unknown",
  };
}

function saveConfig(config: ArduinoConfig): void {
  try {
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Error saving config:", error);
  }
}

async function testConnection(ipAddress: string, port: number): Promise<string> {
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 5000)
    );

    const response = (await Promise.race([
      fetch(`http://${ipAddress}:${port}/api/status`, { method: "GET" }),
      timeout,
    ])) as Response;

    if (!(response instanceof Response)) {
      return "Offline";
    }

    const text = await response.text();
    const normalized = parseConnectionStatus(text);

    if (response.ok && normalized === "Connected") {
      return "Connected";
    }

    if (response.ok && normalized === "Connection Failed") {
      return "Connection Failed";
    }

    return normalized === "Connected" ? "Connected" : "Offline";
  } catch (error) {
    console.error("Arduino connection check failed:", error);
    return "Offline";
  }
}

export async function GET() {
  const config = getConfig();
  return NextResponse.json(config);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === "update") {
      const { deviceId, ipAddress, port } = body;

      if (!ipAddress) {
        return NextResponse.json(
          { error: "IP Address harus diisi" },
          { status: 400 }
        );
      }

      // Test connection
      const status = await testConnection(ipAddress, port || 3000);

      const config: ArduinoConfig = {
        deviceId: deviceId || "ESP32-01",
        ipAddress,
        port: port || 3000,
        isActive: status === "Connected",
        status,
        lastChecked: new Date().toISOString(),
      };

      saveConfig(config);

      return NextResponse.json({
        success: true,
        config,
        message: `Konfigurasi disimpan. Status: ${status}`,
      });
    }

    if (body.action === "testConnection") {
      const { ipAddress, port } = body;
      
      if (!ipAddress) {
        return NextResponse.json(
          { error: "IP Address harus diisi" },
          { status: 400 }
        );
      }

      const status = await testConnection(ipAddress, port || 3000);
      return NextResponse.json({ status, ipAddress, port: port || 3000 });
    }

    return NextResponse.json(
      { error: "Action tidak dikenali" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in Arduino config:", error);
    return NextResponse.json(
      { error: "Gagal memproses request" },
      { status: 500 }
    );
  }
}
