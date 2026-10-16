import { NextResponse } from "next/server";

type DeviceMap = { [deviceId: string]: string };

const globalAny: any = global;
globalAny.DEVICE_IPS = globalAny.DEVICE_IPS || {};

export async function GET() {
  return NextResponse.json({ devices: globalAny.DEVICE_IPS });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { deviceId, ip } = payload || {};
    if (!deviceId || !ip) return NextResponse.json({ error: "deviceId and ip required" }, { status: 400 });

    globalAny.DEVICE_IPS[deviceId] = ip;
    return NextResponse.json({ ok: true, devices: globalAny.DEVICE_IPS });
  } catch (err) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
}
