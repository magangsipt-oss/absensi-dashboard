import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createFingerprintMappingBackup,
  EmptyFingerprintMappingBackupError,
} from "../../../../lib/fingerprint-mapping-backup";
import { assertProductionDatabaseTarget } from "../../../../lib/database-safety";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || !authorization.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await assertProductionDatabaseTarget();
    const result = await createFingerprintMappingBackup("weekly");
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EmptyFingerprintMappingBackupError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    console.error("Fingerprint mapping backup failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Backup fingerprint gagal. Periksa log Vercel." }, { status: 500 });
  }
}
