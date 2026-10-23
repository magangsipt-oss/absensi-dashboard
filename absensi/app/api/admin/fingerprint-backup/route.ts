import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  listFingerprintMappingBackups,
  previewFingerprintMappingRestore,
  restoreFingerprintMappings,
} from "../../../../lib/fingerprint-mapping-backup";
import { assertProductionDatabaseTarget } from "../../../../lib/database-safety";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const secret = process.env.BACKUP_RESTORE_SECRET;
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
    const backups = await listFingerprintMappingBackups();
    return NextResponse.json({ backups });
  } catch (error) {
    console.error("Could not list fingerprint backups:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Daftar backup tidak dapat dimuat." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { key?: unknown; confirm?: unknown; allowDifferentDatabase?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
  }
  if (typeof body.key !== "string") {
    return NextResponse.json({ error: "ID file backup wajib dipilih." }, { status: 400 });
  }

  try {
    await assertProductionDatabaseTarget();
    const allowDifferentDatabase = body.allowDifferentDatabase === true;
    const requiredConfirmation = allowDifferentDatabase
      ? "RESTORE-FINGERPRINT-MAPPINGS-TO-NEW-DATABASE"
      : "RESTORE-FINGERPRINT-MAPPINGS";
    if (body.confirm === requiredConfirmation) {
      const result = await restoreFingerprintMappings(body.key, allowDifferentDatabase);
      return NextResponse.json({ ok: true, restored: result });
    }

    const preview = await previewFingerprintMappingRestore(body.key, allowDifferentDatabase);
    return NextResponse.json({
      ok: true,
      mode: "preview",
      preview,
      confirmationRequired: requiredConfirmation,
    });
  } catch (error) {
    console.error("Fingerprint mapping restore failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Pemulihan mapping gagal.",
    }, { status: 409 });
  }
}
