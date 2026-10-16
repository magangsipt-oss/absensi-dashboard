import { PrismaClient, AttendanceRecord as PrismaAttendanceRecord, Employee as PrismaEmployee } from "@prisma/client";

export type AttendanceStatus = "Hadir" | "Terlambat" | "Pulang" | "Izin" | "Alpha";

export interface AttendanceRecord {
  id: number;
  employeeId?: number | null;
  name: string;
  time: string;
  status: AttendanceStatus;
  note: string;
  checkedAt: string;
}

export interface Employee {
  id: number;
  name: string;
  nickname: string;
  email: string;
  department: string;
  fingerprintId?: number | null;
  pendingFingerprintId?: number | null;
  createdAt: string;
}

export interface FingerprintMapping {
  id: number;
  deviceId?: string | null;
  templateId: number;
  templateData?: string | null;
  employeeId?: number | null;
  createdAt: string;
}

export interface FingerprintVerificationLog {
  id: number;
  employeeId?: number | null;
  deviceId?: string | null;
  templateId: number;
  status: string;
  note?: string | null;
  verifiedAt: string;
}

export interface AnnualAttendanceDay {
  date: string;
  dayName: string;
  isFuture: boolean;
  totalEmployees: number;
  totalScans: number;
  hadir: number;
  terlambat: number;
  pulang: number;
  izin: number;
  sakit: number;
  alpha: number;
  attendees: Array<{ name: string; status: string }>;
  departedEmployees: string[];
  absentEmployees: string[];
}

export interface AttendanceState {
  today: string;
  currentStatus: {
    checkedIn: boolean;
    checkedAt: string | null;
    location: string;
  };
  records: AttendanceRecord[];
  employees: Employee[];
  mappings?: FingerprintMapping[];
  verificationLogs?: FingerprintVerificationLog[];
  annualSummary: {
    year: number;
    workdays: AnnualAttendanceDay[];
  };
}

export interface AttendanceInput {
  name: string;
  status: AttendanceStatus;
  note?: string;
  location?: string;
}

const attendanceTimeZone = "Asia/Makassar";

// Initialize Prisma Client
const prismaClientSingleton = () => {
  return new PrismaClient();
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: attendanceTimeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: attendanceTimeZone }).format(date);
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function getAnnualSummary(
  records: Array<{ employeeId: number | null; name: string; status: string; note: string; checkedAt: Date }>,
  employees: Array<{ id: number; name: string }>,
  now: Date
): { year: number; workdays: AnnualAttendanceDay[] } {
  const year = now.getFullYear();
  const start = new Date(year, 8, 1);
  const end = new Date(year + 1, 8, 1);
  const grouped = new Map<string, typeof records>();

  records.forEach((record) => {
    const key = getLocalDateKey(record.checkedAt);
    const dayRecords = grouped.get(key) ?? [];
    dayRecords.push(record);
    grouped.set(key, dayRecords);
  });

  const workdays: AnnualAttendanceDay[] = [];
  for (const date = new Date(start); date < end; date.setDate(date.getDate() + 1)) {
    if (!isWeekday(date)) continue;
    const dateKey = getLocalDateKey(date);
    const dayRecords = grouped.get(dateKey) ?? [];
    const isFuture = date > now;
    const latestByEmployee = new Map<string, (typeof dayRecords)[number]>();
    [...dayRecords]
      .sort((first, second) => second.checkedAt.getTime() - first.checkedAt.getTime())
      .forEach((record) => {
        const key = record.employeeId === null ? `name:${record.name}` : `employee:${record.employeeId}`;
        if (!latestByEmployee.has(key)) latestByEmployee.set(key, record);
      });
    const uniqueEmployees = new Set(
      dayRecords.map((record) => record.employeeId).filter((id): id is number => id !== null)
    );
    const latestAttendance = [...latestByEmployee.values()];
    const presentStatuses = new Set(["Hadir", "Terlambat", "Pulang"]);
    const attendeesByName = new Map<string, { name: string; status: string }>();
    latestAttendance
      .filter((record) => presentStatuses.has(record.status))
      .filter((record) => record.name)
      .forEach((record) => {
        if (!attendeesByName.has(record.name)) {
          attendeesByName.set(record.name, { name: record.name, status: record.status });
        }
      });
    const attendees = [...attendeesByName.values()];
    const departedEmployees = attendees
      .filter((attendee) => attendee.status === "Pulang")
      .map((attendee) => attendee.name);
    const attendanceStatuses = attendees.filter((attendee) => attendee.status !== "Pulang");
    const absentEmployees = employees
      .filter((employee) => !uniqueEmployees.has(employee.id))
      .map((employee) => employee.name);
    const countStatus = (status: string) => latestAttendance.filter((record) => record.status === status).length;
    const izinRecords = latestAttendance.filter((record) => record.status === "Izin");

    workdays.push({
      date: dateKey,
      dayName: date.toLocaleDateString("id-ID", { weekday: "long" }),
      isFuture,
      totalEmployees: employees.length,
      totalScans: dayRecords.length,
      hadir: countStatus("Hadir"),
      terlambat: countStatus("Terlambat"),
      pulang: countStatus("Pulang"),
      izin: izinRecords.filter((record) => !record.note.trim().toLowerCase().startsWith("sakit")).length,
      sakit: izinRecords.filter((record) => record.note.trim().toLowerCase().startsWith("sakit")).length,
      alpha: isFuture ? 0 : Math.max(employees.length - uniqueEmployees.size, 0),
      attendees: attendanceStatuses,
      departedEmployees,
      absentEmployees: isFuture ? [] : absentEmployees,
    });
  }

  return { year, workdays };
}

export async function getAttendanceState(): Promise<AttendanceState> {
  await prisma.attendanceRecord.updateMany({
    where: {
      OR: [
        { note: { contains: "by device" } },
        { note: { contains: "Pulang dari" } },
        { note: { contains: "Fingerprint scan from" } },
      ],
    },
    data: { note: "-" },
  });

  const records = await prisma.attendanceRecord.findMany({
    orderBy: { checkedAt: "desc" },
    take: 100,
  });

  const employees = await prisma.employee.findMany({
    orderBy: { createdAt: "desc" },
  });

  const employeeMappings = await prisma.fingerprintMapping.findMany({
    select: { employeeId: true, templateId: true },
  });
  const fingerprintIdByEmployee = new Map(
    employeeMappings
      .filter((mapping) => mapping.employeeId !== null)
      .map((mapping) => [mapping.employeeId as number, mapping.templateId])
  );

  const yearStart = new Date(new Date().getFullYear(), 8, 1);
  const annualEnd = new Date(new Date().getFullYear() + 1, 8, 1);
  const annualRecords = await prisma.attendanceRecord.findMany({
    where: { checkedAt: { gte: yearStart, lt: annualEnd } },
    select: { employeeId: true, name: true, status: true, note: true, checkedAt: true },
  });

  const mappingsRaw = await prisma.fingerprintMapping.findMany({ orderBy: { createdAt: "desc" } });
  const verificationLogsRaw = await prisma.fingerprintVerificationLog.findMany({ orderBy: { verifiedAt: "desc" } });

  const attendanceRecords: AttendanceRecord[] = records.map((r: PrismaAttendanceRecord) => ({
    id: r.id,
    employeeId: r.employeeId,
    name: r.name,
    time: r.time,
    status: r.status as AttendanceStatus,
    note: r.note,
    checkedAt: r.checkedAt.toISOString(),
  }));

  const employeeList: Employee[] = employees.map((e: PrismaEmployee) => ({
    id: e.id,
    name: e.name,
    nickname: e.nickname,
    email: e.email,
    department: e.department,
    fingerprintId: fingerprintIdByEmployee.get(e.id) ?? null,
    pendingFingerprintId: e.pendingFingerprintId,
    createdAt: e.createdAt.toISOString(),
  }));

  const mappingList = mappingsRaw.map((m) => ({
    id: m.id,
    deviceId: m.deviceId === "COM7" ? "ESP32-01" : m.deviceId,
    templateId: m.templateId,
    templateData: (m as any).templateData ?? null,
    employeeId: m.employeeId,
    createdAt: m.createdAt.toISOString(),
  }));

  const verificationLogs = verificationLogsRaw.map((log) => ({
    id: log.id,
    employeeId: log.employeeId,
    deviceId: log.deviceId,
    templateId: log.templateId,
    status: log.status,
    note: log.note,
    verifiedAt: log.verifiedAt.toISOString(),
  }));

  const now = new Date();
  return {
    today: getLocalDateKey(new Date()),
    currentStatus: {
      checkedIn: true,
      checkedAt: new Date().toISOString(),
      location: "Kantor Pusat",
    },
    records: attendanceRecords,
    employees: employeeList,
    mappings: mappingList,
    verificationLogs,
    annualSummary: getAnnualSummary(annualRecords, employees.map((employee) => ({ id: employee.id, name: employee.name })), now),
  };
}


export async function addAttendanceRecord(input: AttendanceInput): Promise<AttendanceState> {
  const now = new Date();

  await prisma.attendanceRecord.create({
    data: {
      name: input.name.trim() || "Pegawai",
      time: formatTime(now),
      status: input.status,
      note: input.note?.trim() || "Catatan manual",
      checkedAt: now,
    },
  });

  return getAttendanceState();
}

export async function deleteAttendanceRecord(recordId: number): Promise<AttendanceState> {
  await prisma.attendanceRecord.delete({
    where: { id: recordId },
  }).catch(() => null);

  return getAttendanceState();
}

export async function getEmployees(): Promise<Employee[]> {
  const employees = await prisma.employee.findMany({
    orderBy: { createdAt: "desc" },
  });

  return employees.map((e: PrismaEmployee) => ({
    id: e.id,
    name: e.name,
    nickname: e.nickname,
    email: e.email,
    department: e.department,
    createdAt: e.createdAt.toISOString(),
  }));
}

export async function addEmployee(
  name: string,
  nickname: string,
  email: string,
  department: string,
  fingerprintId?: number
): Promise<AttendanceState> {
  const numericFingerprintId = typeof fingerprintId === "number" ? fingerprintId : 0;
  const validFingerprintId = Number.isInteger(numericFingerprintId) && numericFingerprintId >= 1 && numericFingerprintId <= 127
    ? numericFingerprintId
    : null;
  const normalizedEmail = email.trim().toLowerCase();
  const employee = await prisma.employee.upsert({
    where: { email: normalizedEmail },
    update: {
      name: name.trim(),
      nickname: nickname.trim(),
      department: department.trim(),
      pendingFingerprintId: validFingerprintId,
    },
    create: {
      name: name.trim(),
      nickname: nickname.trim(),
      email: normalizedEmail,
      department: department.trim(),
      pendingFingerprintId: validFingerprintId,
    },
  });

  if (employee && validFingerprintId !== null) {
    await prisma.fingerprintMapping.upsert({
      where: { templateId: validFingerprintId },
      update: { employeeId: null },
      create: { templateId: validFingerprintId, employeeId: null, deviceId: null, templateData: null },
    });
  }

  return getAttendanceState();
}

export async function deleteEmployee(employeeId: number): Promise<AttendanceState> {
  await prisma.employee.delete({
    where: { id: employeeId },
  }).catch(() => null);

  return getAttendanceState();
}

export async function toggleAttendanceStatus(name = "Anda"): Promise<AttendanceState> {
  const now = new Date();

  await prisma.attendanceRecord.create({
    data: {
      name,
      time: formatTime(now),
      status: "Hadir",
      note: "Check-in via sistem",
      checkedAt: now,
    },
  });

  return getAttendanceState();
}
