import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/attendance-store";
import { assertProductionDatabaseTarget } from "../../../../lib/database-safety";

export const runtime = "nodejs";

// GET /api/attendance/archive            -> list of archived months
// GET /api/attendance/archive?month=YYYY-MM -> CSV download of that month
export async function GET(request: Request) {
  try {
    await assertProductionDatabaseTarget();
    const month = new URL(request.url).searchParams.get("month");

    if (!month) {
      const parts = await prisma.attendanceArchive.groupBy({
        by: ["month"],
        _sum: { rowCount: true },
        orderBy: { month: "desc" },
      });
      return NextResponse.json({
        archives: parts.map((part) => ({ month: part.month, rows: part._sum.rowCount ?? 0 })),
      });
    }

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: "Format bulan harus YYYY-MM" }, { status: 400 });
    }
    const parts = await prisma.attendanceArchive.findMany({ where: { month }, orderBy: { id: "asc" } });
    if (parts.length === 0) {
      return NextResponse.json({ error: "Arsip bulan ini tidak ditemukan" }, { status: 404 });
    }
    // Every part starts with the same header line; keep it once.
    const [first, ...rest] = parts.map((part) => part.content);
    const body = [first, ...rest.map((content) => content.split("\r\n").slice(1).join("\r\n"))]
      .filter(Boolean)
      .join("\r\n");
    return new Response(`﻿${body}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="arsip-absensi-${month}.csv"`,
      },
    });
  } catch (error) {
    console.error("Attendance archive request failed:", error instanceof Error ? error.message : "UnknownError");
    return NextResponse.json({ error: "Arsip absensi tidak dapat dimuat." }, { status: 503 });
  }
}
