import { NextResponse } from "next/server";
import { addEmployee, deleteEmployee, getEmployees } from "../../../lib/attendance-store";
import { prisma } from "../../../lib/attendance-store";

async function deleteFingerprintFromDevice(templateId: number) {
  await prisma.deviceCommand.create({
    data: {
      deviceId: "ESP32-01",
      command: "DELETE_FINGERPRINT",
      templateId,
    },
  });
}

export async function GET() {
  try {
    const employees = await getEmployees();
    return NextResponse.json({ employees });
  } catch (error) {
    return NextResponse.json({ error: "Gagal memuat pegawai" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    if (payload?.action === "delete") {
      const employeeId = Number(payload.employeeId);
      const mappings = await prisma.fingerprintMapping.findMany({ where: { employeeId }, select: { templateId: true } });
      await Promise.all(mappings.map((mapping) => deleteFingerprintFromDevice(mapping.templateId)));
      await prisma.fingerprintMapping.deleteMany({ where: { employeeId } });
      const state = await deleteEmployee(employeeId);
      return NextResponse.json(state);
    }

    const fingerprintId = Number(payload.fingerprintId);
    const state = await addEmployee(
      payload.name,
      payload.nickname,
      payload.email,
      payload.department,
      Number.isInteger(fingerprintId) ? fingerprintId : undefined
    );
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json({ error: "Gagal memproses pegawai" }, { status: 500 });
  }
}
