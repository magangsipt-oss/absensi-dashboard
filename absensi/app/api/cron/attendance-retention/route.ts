import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { assertProductionDatabaseTarget } from "../../../../lib/database-safety";
import { runAttendanceRetention } from "../../../../lib/attendance-retention";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || !authorization.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

// Archives attendance older than the previous calendar month, then deletes it. Add ?dryRun=1 to preview only.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await assertProductionDatabaseTarget();
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const result = await runAttendanceRetention({ dryRun });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Attendance retention failed:", error instanceof Error ? error.message : "UnknownError");
    return NextResponse.json({ error: "Retensi absensi gagal. Periksa log Vercel." }, { status: 500 });
  }
}
