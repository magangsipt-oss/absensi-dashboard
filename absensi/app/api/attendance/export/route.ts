import { prisma } from "../../../../lib/attendance-store";
import * as XLSX from "xlsx";

function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getWitaDayBounds(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, -8));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const month = searchParams.get("month") ?? "";
  const date = searchParams.get("date") ?? "";
  const range = searchParams.get("range") ?? "";

  if (isValidDate(date)) {
    const { start, end } = getWitaDayBounds(date);
    const records = await prisma.attendanceRecord.findMany({
      where: { checkedAt: { gte: start, lt: end } },
      orderBy: [{ checkedAt: "asc" }, { name: "asc" }],
    });
    const rows = records.map((record) => ({
      Tanggal: date,
      Jam: record.time,
      "Nama Pegawai": record.name,
      Status: record.status,
      Keterangan: record.note || "-",
      "ID Pegawai": record.employeeId ?? "",
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Keterangan: `Tidak ada data absensi untuk ${date}` }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Harian");
    const file = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    return new Response(file, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rekap-absensi-${date}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (range === "annual") {
    const year = new Date().getFullYear();
    const start = new Date(year, 8, 1);
    const end = new Date(year + 1, 8, 1);
    const records = await prisma.attendanceRecord.findMany({
      where: { checkedAt: { gte: start, lt: end } },
      orderBy: [{ checkedAt: "asc" }, { name: "asc" }],
    });
    const rows = records.map((record) => ({
      Tanggal: record.checkedAt.toLocaleDateString("id-ID", { timeZone: "Asia/Makassar" }),
      Jam: record.time || record.checkedAt.toLocaleTimeString("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit" }),
      "Nama Pegawai": record.name,
      Status: record.status,
      Keterangan: record.note || "-",
      "ID Pegawai": record.employeeId ?? "",
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Keterangan: `Tidak ada data absensi untuk ${year}-${year + 1}` }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Tahunan");
    const file = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    return new Response(file, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rekap-absensi-${year}-${year + 1}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (!isValidMonth(month)) {
    return new Response("Parameter month harus berformat YYYY-MM", { status: 400 });
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const end = new Date(year, monthNumber, 1);
  const records = await prisma.attendanceRecord.findMany({
    where: { checkedAt: { gte: start, lt: end } },
    orderBy: [{ checkedAt: "asc" }, { name: "asc" }],
  });

  const rows = records.map((record) => ({
    Tanggal: record.checkedAt.toLocaleDateString("id-ID", { timeZone: "Asia/Makassar" }),
    Jam: record.time || record.checkedAt.toLocaleTimeString("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit" }),
    "Nama Pegawai": record.name,
    Status: record.status,
    Catatan: record.note,
    "ID Pegawai": record.employeeId ?? "",
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Keterangan: `Tidak ada data absensi untuk ${month}` }]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Absensi");
  const file = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

  return new Response(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rekap-absensi-${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
