import { prisma } from "../../../../lib/attendance-store";
import { assertProductionDatabaseTarget } from "../../../../lib/database-safety";
import {
  getAttendanceDateKey,
  isAttendanceDayClosed,
  isAttendanceWorkday,
  wasRegisteredByAttendanceClose,
} from "../../../../lib/attendance-calendar";

function isValidMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function getMonthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1, -8));
  const end = new Date(Date.UTC(year, monthNumber, 1, -8));
  return { start, end, year, monthNumber };
}

function getStatusCode(status: string, note: string) {
  if (status === "Hadir" && note.trim().toLowerCase() === "site") return "SITE";
  if (status === "Alpha") return "A";
  if (status === "Izin") return note.trim().toLowerCase().startsWith("sakit") ? "S" : "I";
  if (status === "Terlambat") return "L";
  if (status === "Pulang") return "P";
  return "H";
}

export async function GET(request: Request) {
  try {
    await assertProductionDatabaseTarget();
  } catch (error) {
    console.error("Production database safety check failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Database safety check failed." },
      { status: 503 }
    );
  }

  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!isValidMonth(month)) {
    return Response.json({ error: "Parameter month harus berformat YYYY-MM" }, { status: 400 });
  }

  const { start, end, year, monthNumber } = getMonthBounds(month);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const now = new Date();
  const [employees, records] = await Promise.all([
    prisma.employee.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, department: true, createdAt: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { checkedAt: { gte: start, lt: end } },
      orderBy: { checkedAt: "asc" },
      select: { employeeId: true, name: true, status: true, note: true, time: true, checkedAt: true },
    }),
  ]);

  const employeeIdByName = new Map<string, number | null>();
  employees.forEach((employee) => {
    const normalizedName = employee.name.trim().toLocaleLowerCase();
    employeeIdByName.set(normalizedName, employeeIdByName.has(normalizedName) ? null : employee.id);
  });

  const latestByEmployeeDay = new Map<string, { code: string; status: string; time: string; note: string }>();
  for (const record of records) {
    const date = getAttendanceDateKey(record.checkedAt);
    const normalizedName = record.name.trim().toLocaleLowerCase();
    const employeeId = record.employeeId ?? employeeIdByName.get(normalizedName) ?? null;
    const employeeKey = employeeId === null ? `name:${normalizedName}` : `employee:${employeeId}`;
    const key = `${employeeKey}:${date}`;
    const isSite = record.note.trim().toLowerCase() === "site";
    const existing = latestByEmployeeDay.get(key);
    if (existing?.code === "SITE" && !isSite) continue;
    latestByEmployeeDay.set(key, {
      code: isSite ? "SITE" : getStatusCode(record.status, record.note || ""),
      status: record.status,
      time: record.time || "-",
      note: record.note || "-",
    });
  }

  for (const employee of employees) {
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const key = `employee:${employee.id}:${date}`;
      if (
        !latestByEmployeeDay.has(key) &&
        wasRegisteredByAttendanceClose(date, employee.createdAt) &&
        isAttendanceWorkday(date) &&
        isAttendanceDayClosed(date, now)
      ) {
        latestByEmployeeDay.set(key, {
          code: "A",
          status: "Alpha",
          time: "-",
          note: "Otomatis setelah batas waktu pulang tanpa catatan absensi",
        });
      }
    }
  }

  return Response.json({
    month,
    days: Array.from({ length: daysInMonth }, (_, index) => index + 1),
    employees: employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      department: employee.department,
      cells: Object.fromEntries(Array.from({ length: daysInMonth }, (_, index) => {
        const date = `${month}-${String(index + 1).padStart(2, "0")}`;
        return [date, latestByEmployeeDay.get(`employee:${employee.id}:${date}`) ?? null];
      })),
    })),
    unlinkedRecords: records
      .filter((record) => record.employeeId === null)
      .map((record) => ({ name: record.name, date: getAttendanceDateKey(record.checkedAt) })),
  });
}
