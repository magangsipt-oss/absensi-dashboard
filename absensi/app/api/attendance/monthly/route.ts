import { prisma } from "../../../../lib/attendance-store";

const attendanceTimeZone = "Asia/Makassar";

function isValidMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function getMonthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1, -8));
  const end = new Date(Date.UTC(year, monthNumber, 1, -8));
  return { start, end, year, monthNumber };
}

function getWitaDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: attendanceTimeZone }).format(date);
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
  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!isValidMonth(month)) {
    return Response.json({ error: "Parameter month harus berformat YYYY-MM" }, { status: 400 });
  }

  const { start, end, year, monthNumber } = getMonthBounds(month);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const [employees, records] = await Promise.all([
    prisma.employee.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, department: true } }),
    prisma.attendanceRecord.findMany({
      where: { checkedAt: { gte: start, lt: end } },
      orderBy: { checkedAt: "asc" },
      select: { employeeId: true, name: true, status: true, note: true, time: true, checkedAt: true },
    }),
  ]);

  const latestByEmployeeDay = new Map<string, { code: string; status: string; time: string; note: string }>();
  for (const record of records) {
    const date = getWitaDateKey(record.checkedAt);
    const employeeKey = record.employeeId ? `employee:${record.employeeId}` : `name:${record.name}`;
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
      .map((record) => ({ name: record.name, date: getWitaDateKey(record.checkedAt) })),
  });
}
