import os from "os";
import { NextResponse } from "next/server";

function getLocalIPv4(): string | null {
  const nets = os.networkInterfaces();
  const candidates: string[] = [];

  for (const name of Object.keys(nets)) {
    const netInfo = nets[name as keyof typeof nets];
    if (!netInfo) continue;

    for (const net of netInfo) {
      const family = (net as any)?.family;
      const address = (net as any)?.address;
      if (!address || typeof address !== "string") continue;
      if (family !== "IPv4" && family !== 4) continue;

      if (!(net as any).internal && address !== "127.0.0.1") {
        return address;
      }

      candidates.push(address);
    }
  }

  const fallback = candidates.find((ip) => ip !== "127.0.0.1");
  return fallback ?? candidates[0] ?? "127.0.0.1";
}

export async function GET() {
  const ip = getLocalIPv4();
  const port = process.env.PORT || "3000";
  const publicUrl = process.env.LOCAL_TUNNEL_URL || process.env.NOW_PUBLIC_URL || null;

  return NextResponse.json({ ip, port, publicUrl });
}
