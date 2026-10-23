import { NextResponse } from "next/server";
import { addEmployee, getEmployees } from "../../../lib/attendance-store";
import { prisma } from "../../../lib/attendance-store";
import { writeFingerprintMappingAudit } from "../../../lib/fingerprint-mapping-audit";
import { scheduleFingerprintMappingBackup } from "../../../lib/fingerprint-mapping-backup";
import { assertProductionDatabaseTarget } from "../../../lib/database-safety";

export async function GET() {
  try {
    await assertProductionDatabaseTarget();
    const employees = await getEmployees();
    return NextResponse.json({ employees });
  } catch (error) {
    console.error("Error fetching employees:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memuat pegawai." },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await assertProductionDatabaseTarget();
    const payload = await request.json();

    if (payload?.action === "delete") {
      const employeeId = Number(payload.employeeId ?? payload.id);
      if (!Number.isInteger(employeeId) || employeeId < 1) {
        return NextResponse.json({ error: "employeeId invalid" }, { status: 400 });
      }
      if (payload.confirmation !== "DELETE_EMPLOYEE") {
        return NextResponse.json(
          { error: "Konfirmasi penghapusan pegawai tidak valid." },
          { status: 400 }
        );
      }

      await prisma.$transaction(async (transaction) => {
        const mappings = await transaction.fingerprintMapping.findMany({
          where: { employeeId },
          select: { templateId: true, deviceId: true, employeeId: true },
        });
        for (const mapping of mappings) {
          await transaction.deviceCommand.create({
            data: {
              deviceId: mapping.deviceId || "ESP32-01",
              command: "DELETE_FINGERPRINT",
              templateId: mapping.templateId,
            },
          });
          await writeFingerprintMappingAudit(transaction, {
            action: "EMPLOYEE_DELETED",
            templateId: mapping.templateId,
            deviceId: mapping.deviceId,
            previousEmployeeId: mapping.employeeId,
            employeeId: mapping.employeeId,
          });
        }
        await transaction.fingerprintMapping.deleteMany({ where: { employeeId } });
        await transaction.employee.delete({ where: { id: employeeId } });
      });
      scheduleFingerprintMappingBackup("admin-delete-employee");
      return NextResponse.json({ employees: await getEmployees() });
    }

    const fingerprintId = Number(payload.fingerprintId);
    const state = await addEmployee(
      payload.name,
      payload.nickname,
      payload.email,
      payload.department,
      Number.isInteger(fingerprintId) ? fingerprintId : undefined
    );
    scheduleFingerprintMappingBackup("admin-save-employee");
    return NextResponse.json(state);
  } catch (error) {
    console.error("Error processing employee request:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memproses pegawai." },
      { status: 500 }
    );
  }
}
