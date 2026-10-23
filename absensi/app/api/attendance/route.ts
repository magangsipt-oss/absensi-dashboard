import { NextResponse } from "next/server";
import { addAttendanceRecord, getAttendanceState, toggleAttendanceStatus, prisma } from "../../../lib/attendance-store";
import { writeFingerprintMappingAudit } from "../../../lib/fingerprint-mapping-audit";
import { scheduleFingerprintMappingBackup } from "../../../lib/fingerprint-mapping-backup";
import { assertProductionDatabaseTarget } from "../../../lib/database-safety";
import fs from "fs";
import path from "path";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

type FingerprintAttendanceStatus = "Hadir" | "Terlambat" | "Pulang";

const attendanceTimeZone = "Asia/Makassar";

function getWitaParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: attendanceTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  return Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
}

function getWitaTime(date: Date) {
  const { hour, minute } = getWitaParts(date);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getWitaDayBounds(date: Date) {
  const { year, month, day } = getWitaParts(date);
  const start = new Date(Date.UTC(year, month - 1, day, -8));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function getFingerprintAttendanceStatus(date: Date): FingerprintAttendanceStatus | null {
  const { hour, minute } = getWitaParts(date);
  const minutes = hour * 60 + minute;
  if (minutes >= 60 && minutes < 490) return "Hadir";
  if (minutes >= 490 && minutes < 1010) return "Terlambat";
  if (minutes >= 1010 && minutes <= 1140) return "Pulang";
  return null;
}

function toBase64Url(buffer: Buffer | ArrayBuffer | Uint8Array | ArrayBufferView) {
  const b = Buffer.from(buffer as any).toString("base64");
  return b.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(input: string) {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(base64, "base64");
}

function getRpId() {
  return process.env.WEBAUTHN_RPID || "localhost";
}

function normalizeFingerprintTemplate(value: unknown) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

async function deleteFingerprintFromEsp32(templateId: number) {
  try {
    const configFile = path.join(process.cwd(), "data", "arduino-config.json");
    if (!fs.existsSync(configFile)) return { ok: false, error: "IP ESP32 belum dikonfigurasi" };
    const config = JSON.parse(fs.readFileSync(configFile, "utf-8")) as { ipAddress?: string; port?: number };
    if (!config.ipAddress) return { ok: false, error: "IP ESP32 belum dikonfigurasi" };

    const baseUrl = `http://${config.ipAddress}:${config.port || 3000}`;
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-device-key": process.env.ESP32_DEVICE_KEY || "rahasia123",
    };
    const response = await fetch(`${baseUrl}/api/delete`, {
      method: "POST",
      headers,
      body: new URLSearchParams({ templateId: String(templateId) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      return { ok: false, error: data.error || `ESP32 mengembalikan status ${response.status}` };
    }
    await fetch(`${baseUrl}/api/cache/delete`, {
      method: "POST",
      headers,
      body: new URLSearchParams({ templateId: String(templateId) }),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "ESP32 tidak dapat diakses melalui Wi-Fi" };
  }
}

export async function GET() {
  try {
    await assertProductionDatabaseTarget();
    const state = await getAttendanceState();
    return NextResponse.json(state);
  } catch (error) {
    console.error("Error fetching attendance state:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memverifikasi database." },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await assertProductionDatabaseTarget();
    const payload = await request.json().catch(() => ({}));

    if (payload?.action === "syncSensorTemplates") {
      const deviceId = String(payload.deviceId || "ESP32-01").trim();
      if (!deviceId || deviceId.length > 64) {
        return NextResponse.json({ error: "deviceId invalid" }, { status: 400 });
      }
      const command = await prisma.deviceCommand.create({
        data: { deviceId, command: "SYNC_TEMPLATES" },
      });
      return NextResponse.json(
        { ok: true, queued: true, commandId: command.id, deviceId },
        { status: 202 }
      );
    }

    if (payload?.action === "deviceSync") {
      const key = request.headers.get("x-device-key");
      if (key !== process.env.DEVICE_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const mappings = await prisma.fingerprintMapping.findMany({
        where: { employeeId: { not: null } },
        select: { templateId: true, employeeId: true },
        orderBy: { templateId: "asc" },
      });
      const employees = await prisma.employee.findMany({
        where: { id: { in: mappings.map((mapping) => mapping.employeeId as number) } },
        select: { id: true, name: true, nickname: true },
      });
      const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

      return NextResponse.json({
        ok: true,
        mappings: mappings.map((mapping) => {
          const employee = employeeById.get(mapping.employeeId as number);
          return {
            templateId: mapping.templateId,
            nickname: employee?.nickname || employee?.name || "",
          };
        }).filter((mapping) => mapping.nickname),
      });
    }

    if (payload?.action === "deviceSyncTemplates") {
      const key = request.headers.get("x-device-key");
      if (key !== process.env.DEVICE_KEY) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const deviceId = String(payload.deviceId || "").trim();
      if (!deviceId || deviceId.length > 64) {
        return NextResponse.json({ error: "deviceId invalid" }, { status: 400 });
      }
      if (!Array.isArray(payload.templates)) {
        return NextResponse.json({ error: "templates must be an array" }, { status: 400 });
      }

      const receivedTemplateIds: unknown[] = payload.templates;
      const numericTemplateIds: number[] = receivedTemplateIds.map((value) => Number(value));
      const templateIds = [...new Set(numericTemplateIds)]
        .filter((templateId) => Number.isInteger(templateId) && templateId >= 1 && templateId <= 127)
        .sort((first, second) => first - second);
      if (templateIds.length === 0) {
        return NextResponse.json({ error: "No valid fingerprint templates received" }, { status: 400 });
      }

      const existingMappings = await prisma.fingerprintMapping.findMany({
        where: { templateId: { in: templateIds } },
        select: { templateId: true, deviceId: true, employeeId: true },
      });
      const existingByTemplateId = new Map(
        existingMappings.map((mapping) => [mapping.templateId, mapping])
      );
      const pendingEmployees = await prisma.employee.findMany({
        where: { pendingFingerprintId: { in: templateIds } },
        select: { id: true, pendingFingerprintId: true },
      });
      const pendingEmployeeByTemplateId = new Map(
        pendingEmployees.flatMap((employee) =>
          employee.pendingFingerprintId === null
            ? []
            : [[employee.pendingFingerprintId, employee.id] as const]
        )
      );
      let changedTemplateCount = 0;
      let autoMappedCount = 0;
      await prisma.$transaction(async (transaction) => {
        for (const templateId of templateIds) {
          const existing = existingByTemplateId.get(templateId);
          const pendingEmployeeId = pendingEmployeeByTemplateId.get(templateId);
          const mappedEmployeeId = existing?.employeeId ?? pendingEmployeeId ?? null;
          const savedMapping = await transaction.fingerprintMapping.upsert({
            where: { templateId },
            update: {
              ...(!existing?.deviceId ? { deviceId } : {}),
              ...(existing?.employeeId === null && pendingEmployeeId
                ? { employeeId: pendingEmployeeId }
                : {}),
            },
            create: { templateId, deviceId, employeeId: mappedEmployeeId, templateData: null },
          });

          if (
            !existing ||
            existing.deviceId !== savedMapping.deviceId ||
            existing.employeeId !== savedMapping.employeeId
          ) {
            changedTemplateCount += 1;
            const auditAction = !existing
              ? "DISCOVERED"
              : existing.employeeId !== savedMapping.employeeId
                ? "MAPPED"
                : "DEVICE_CHANGED";
            await writeFingerprintMappingAudit(transaction, {
              action: auditAction,
              templateId,
              deviceId: savedMapping.deviceId,
              previousEmployeeId: existing?.employeeId ?? null,
              employeeId: savedMapping.employeeId,
            });
          }

          if (pendingEmployeeId && savedMapping.employeeId === pendingEmployeeId) {
            const cleared = await transaction.employee.updateMany({
              where: { id: pendingEmployeeId, pendingFingerprintId: templateId },
              data: { pendingFingerprintId: null },
            });
            autoMappedCount += cleared.count;
          }
        }

        if (autoMappedCount > 0) {
          await transaction.deviceCommand.create({
            data: { deviceId, command: "SYNC_NICKNAMES" },
          });
        }
      });
      if (changedTemplateCount > 0 || autoMappedCount > 0) {
        scheduleFingerprintMappingBackup("device-template-sync");
      }

      return NextResponse.json({
        ok: true,
        deviceId,
        templates: templateIds,
        syncedCount: templateIds.length,
        newlyDiscoveredCount: templateIds.filter((templateId) => !existingByTemplateId.has(templateId)).length,
        unmappedCount: templateIds.filter(
          (templateId) =>
            !existingByTemplateId.get(templateId)?.employeeId &&
            !pendingEmployeeByTemplateId.has(templateId)
        ).length,
        autoMappedCount,
      });
    }

    if (payload?.action === "pollDeviceCommands") {
      const key = request.headers.get("x-device-key");
      if (key !== process.env.DEVICE_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const deviceId = String(payload.deviceId || "");
      if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

      const commands = await prisma.deviceCommand.findMany({
        where: { deviceId, status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 10,
      });
      if (commands.length > 0) {
        await prisma.deviceCommand.updateMany({
          where: { id: { in: commands.map((command) => command.id) }, status: "PENDING" },
          data: { status: "PROCESSING" },
        });
      }
      return NextResponse.json({ ok: true, commands });
    }

    if (payload?.action === "completeDeviceCommand") {
      const key = request.headers.get("x-device-key");
      if (key !== process.env.DEVICE_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const commandId = Number(payload.commandId);
      const success = payload.success !== false;
      if (!Number.isInteger(commandId) || commandId < 1) return NextResponse.json({ error: "commandId invalid" }, { status: 400 });
      await prisma.deviceCommand.update({
        where: { id: commandId },
        data: { status: success ? "DONE" : "FAILED", processedAt: new Date() },
      }).catch(() => null);
      return NextResponse.json({ ok: true });
    }

    if (payload?.action === "deviceSync") {
      const key = request.headers.get("x-device-key");
      if (key !== process.env.DEVICE_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const mappings = await prisma.fingerprintMapping.findMany({
        where: { employeeId: { not: null } },
        select: { templateId: true, employeeId: true },
        orderBy: { templateId: "asc" },
      });
      const employees = await prisma.employee.findMany({
        where: { id: { in: mappings.map((mapping) => mapping.employeeId as number) } },
        select: { id: true, name: true, nickname: true },
      });
      const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

      return NextResponse.json({
        ok: true,
        mappings: mappings.map((mapping) => {
          const employee = employeeById.get(mapping.employeeId as number);
          return {
            templateId: mapping.templateId,
            nickname: employee?.nickname || employee?.name || "",
          };
        }).filter((mapping) => mapping.nickname),
      });
    }

    // Action: add attendance via form
    if (payload?.action === "add") {
      const state = await addAttendanceRecord(payload);
      return NextResponse.json(state);
    }

    if (payload?.action === "addDaily") {
      const employeeId = Number(payload.employeeId);
      const status = String(payload.status || "Site").toLowerCase();
      const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
      if (!employee) {
        return NextResponse.json({ error: "Pegawai tidak ditemukan" }, { status: 404 });
      }
      if (!["site", "sakit", "izin", "alpha"].includes(status)) {
        return NextResponse.json({ error: "Status absensi tidak valid" }, { status: 400 });
      }

      const date = String(payload.tgl || "");
      const time = String(payload.masuk || "-");
      const checkedAt = new Date(`${date}T${time === "-" ? "12:00" : time}:00`);
      if (!date || Number.isNaN(checkedAt.getTime())) {
        return NextResponse.json({ error: "Tanggal absensi tidak valid" }, { status: 400 });
      }

      const databaseStatus = status === "site" ? "Hadir" : status === "alpha" ? "Alpha" : "Izin";
      const note = status === "site"
        ? "Site"
        : `${status === "sakit" ? "Sakit" : status === "izin" ? "Izin" : "Alpha"}${payload.keterangan ? `: ${String(payload.keterangan).trim()}` : ""}`;
      if (status === "site") {
        await prisma.attendanceRecord.createMany({
          data: [
            {
              employeeId: employee.id,
              name: employee.name,
              time,
              status: "Hadir",
              note,
              checkedAt,
            },
            {
              employeeId: employee.id,
              name: employee.name,
              time: "17:00",
              status: "Pulang",
              note,
              checkedAt,
            },
          ],
        });
      } else {
        await prisma.attendanceRecord.create({
          data: {
            employeeId: employee.id,
            name: employee.name,
            time,
            status: databaseStatus as never,
            note,
            checkedAt,
          },
        });
      }
      return NextResponse.json(await getAttendanceState());
    }

    // Action: toggle quick check-in
    if (payload?.action === "toggle") {
      const state = await toggleAttendanceStatus(payload?.name ?? "Anda");
      return NextResponse.json(state);
    }

    if (payload?.action === "deleteRecord") {
      const recordId = Number(payload.recordId);
      if (!Number.isInteger(recordId) || recordId < 1) {
        return NextResponse.json({ error: "recordId invalid" }, { status: 400 });
      }
      if (payload.confirmation !== "DELETE_SINGLE_ATTENDANCE_RECORD") {
        return NextResponse.json(
          { error: "Konfirmasi penghapusan absensi tidak valid." },
          { status: 400 }
        );
      }

      await prisma.attendanceRecord.delete({ where: { id: recordId } });
      return NextResponse.json(await getAttendanceState());
    }

    if (payload?.action === "deleteVerificationLog") {
      const logId = Number(payload.logId);
      if (!Number.isInteger(logId) || logId < 1) {
        return NextResponse.json({ error: "logId invalid" }, { status: 400 });
      }
      if (payload.confirmation !== "DELETE_VERIFICATION_LOG") {
        return NextResponse.json(
          { error: "Konfirmasi penghapusan log verifikasi tidak valid." },
          { status: 400 }
        );
      }

      await prisma.fingerprintVerificationLog.delete({ where: { id: logId } });
      return NextResponse.json(await getAttendanceState());
    }

    if (payload?.action === "deletePastAttendance") {
      if (payload.confirmation !== "DELETE_PAST_ATTENDANCE") {
        return NextResponse.json(
          { error: "Konfirmasi penghapusan absensi lampau tidak valid." },
          { status: 400 }
        );
      }
      const { start: today, end: tomorrow } = getWitaDayBounds(new Date());
      await prisma.$transaction([
        prisma.fingerprintVerificationLog.deleteMany({ where: { verifiedAt: { lt: today } } }),
        prisma.attendanceRecord.deleteMany({ where: { checkedAt: { lt: today } } }),
      ]);

      return NextResponse.json(await getAttendanceState());
    }

    if (payload?.action === "deleteTodayAttendance") {
      if (payload.confirmation !== "DELETE_TODAY_ATTENDANCE") {
        return NextResponse.json(
          { error: "Konfirmasi penghapusan absensi hari ini tidak valid." },
          { status: 400 }
        );
      }
      const { start: today, end: tomorrow } = getWitaDayBounds(new Date());

      await prisma.$transaction([
        prisma.fingerprintVerificationLog.deleteMany({ where: { verifiedAt: { gte: today, lt: tomorrow } } }),
        prisma.attendanceRecord.deleteMany({ where: { checkedAt: { gte: today, lt: tomorrow } } }),
      ]);

      return NextResponse.json(await getAttendanceState());
    }

    // WebAuthn: registration options
    if (payload?.action === "webauthnRegisterOptions") {
      const { employeeId } = payload;
      if (!employeeId) return NextResponse.json({ error: "employeeId required" }, { status: 400 });
      const user = await prisma.employee.findUnique({ where: { id: Number(employeeId) } });
      if (!user) return NextResponse.json({ error: "employee not found" }, { status: 404 });

      const options = await generateRegistrationOptions({
        rpName: "Absensi App",
        rpID: getRpId(),
        userID: new TextEncoder().encode(String(user.id)),
        userName: user.email || user.name,
        attestationType: "none",
        authenticatorSelection: {
          userVerification: "preferred",
          residentKey: "discouraged",
        },
        timeout: 60000,
        excludeCredentials: [],
      });

      (global as any).WEBAUTHN_CHALLENGES = (global as any).WEBAUTHN_CHALLENGES || {};
      (global as any).WEBAUTHN_CHALLENGES[`reg_${user.id}`] = options.challenge;

      return NextResponse.json(options);
    }

    // WebAuthn: verify registration
    if (payload?.action === "webauthnRegisterVerify") {
      const { employeeId, attestation } = payload;
      const expectedChallenge = (global as any).WEBAUTHN_CHALLENGES?.[`reg_${employeeId}`];
      if (!expectedChallenge) return NextResponse.json({ error: "no challenge" }, { status: 400 });

      try {
        const verification = await verifyRegistrationResponse({
          response: attestation,
          expectedChallenge,
          expectedOrigin: process.env.WEBAUTHN_ORIGIN || `http://localhost:3000`,
          expectedRPID: getRpId(),
        });

        const { verified, registrationInfo } = verification;
        if (!verified || !registrationInfo) return NextResponse.json({ error: "not verified" }, { status: 400 });

        const credentialID = registrationInfo.credential.id;
        const publicKey = toBase64Url(registrationInfo.credential.publicKey);
        const counter = registrationInfo.credential.counter;

        await prisma.webAuthnCredential.create({
          data: {
            employeeId: Number(employeeId),
            credentialID,
            publicKey,
            counter,
          },
        });

        return NextResponse.json({ ok: true });
      } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "verification failed" }, { status: 400 });
      } finally {
        delete (global as any).WEBAUTHN_CHALLENGES?.[`reg_${employeeId}`];
      }
    }

    // WebAuthn: authentication options
    if (payload?.action === "webauthnAuthOptions") {
      const { employeeId } = payload;
      if (!employeeId) return NextResponse.json({ error: "employeeId required" }, { status: 400 });

      const creds = await prisma.webAuthnCredential.findMany({ where: { employeeId: Number(employeeId) } });
      if (!creds || creds.length === 0) return NextResponse.json({ error: "no credentials" }, { status: 404 });

      const allowCredentials = creds.map((c) => ({ id: c.credentialID, type: "public-key" }));

      const options = await generateAuthenticationOptions({
        allowCredentials,
        timeout: 60000,
        userVerification: "preferred",
        rpID: getRpId(),
      });

      (global as any).WEBAUTHN_CHALLENGES = (global as any).WEBAUTHN_CHALLENGES || {};
      (global as any).WEBAUTHN_CHALLENGES[`auth_${employeeId}`] = options.challenge;

      return NextResponse.json(options);
    }

    // WebAuthn: verify authentication
    if (payload?.action === "webauthnAuthVerify") {
      const { employeeId, assertion } = payload;
      const expectedChallenge = (global as any).WEBAUTHN_CHALLENGES?.[`auth_${employeeId}`];
      if (!expectedChallenge) return NextResponse.json({ error: "no challenge" }, { status: 400 });

      const credentialID = toBase64Url(fromBase64Url(assertion.rawId));
      const cred = await prisma.webAuthnCredential.findUnique({ where: { credentialID } });
      if (!cred) return NextResponse.json({ error: "credential not found" }, { status: 404 });

      try {
        const verification = await verifyAuthenticationResponse({
          response: assertion,
          expectedChallenge,
          expectedOrigin: process.env.WEBAUTHN_ORIGIN || "http://localhost:3000",
          expectedRPID: getRpId(),
          credential: {
            id: cred.credentialID,
            publicKey: fromBase64Url(cred.publicKey),
            counter: cred.counter,
            transports: [],
          },
        });

        const { verified, authenticationInfo } = verification;
        if (!verified) return NextResponse.json({ error: "not verified" }, { status: 400 });

        await prisma.webAuthnCredential.update({ where: { credentialID: cred.credentialID }, data: { counter: authenticationInfo.newCounter } });

        // create attendance record
        const employee = await prisma.employee.findUnique({ where: { id: Number(employeeId) } });
        await prisma.attendanceRecord.create({
          data: {
            name: employee?.name || "Unknown",
            time: getWitaTime(new Date()),
            status: "Hadir",
            note: "Check-in via WebAuthn",
            checkedAt: new Date(),
            employeeId: Number(employeeId),
          },
        });

        return NextResponse.json({ ok: true });
      } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "verification failed" }, { status: 400 });
      } finally {
        delete (global as any).WEBAUTHN_CHALLENGES?.[`auth_${employeeId}`];
      }
    }

    // Device: enroll fingerprint template posted by ESP32
    if (payload?.action === "deviceEnroll") {
      const key = request.headers.get("x-device-key");
      if (key !== process.env.DEVICE_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const { deviceId, templateId, templateData, employeeId } = payload;
      if (typeof templateId === "undefined") return NextResponse.json({ error: "templateId required" }, { status: 400 });

      const templateIdNumber = Number(templateId);
      if (!Number.isInteger(templateIdNumber) || templateIdNumber < 1 || templateIdNumber > 127) {
        return NextResponse.json({ error: "templateId invalid" }, { status: 400 });
      }

      const normalizedEmployeeId =
        typeof employeeId === "undefined" || employeeId === null || employeeId === "" ? null : Number(employeeId);

      if (normalizedEmployeeId !== null && (!Number.isInteger(normalizedEmployeeId) || normalizedEmployeeId < 1)) {
        return NextResponse.json({ error: "employeeId invalid" }, { status: 400 });
      }

      if (normalizedEmployeeId !== null) {
        const employee = await prisma.employee.findUnique({ where: { id: normalizedEmployeeId } });
        if (!employee) return NextResponse.json({ error: "employee not found" }, { status: 404 });
      }
      const pendingEmployee = normalizedEmployeeId === null
        ? await prisma.employee.findUnique({
            where: { pendingFingerprintId: templateIdNumber },
            select: { id: true },
          })
        : null;

      try {
        const normalizedTemplateData = normalizeFingerprintTemplate(templateData);
        const mapping = await prisma.$transaction(async (transaction) => {
          const existing = await transaction.fingerprintMapping.findUnique({ where: { templateId: templateIdNumber } });
          const mappedEmployeeId = normalizedEmployeeId ?? existing?.employeeId ?? pendingEmployee?.id ?? null;
          const savedMapping = existing
            ? await transaction.fingerprintMapping.update({
                where: { templateId: templateIdNumber },
                data: {
                  deviceId: deviceId || existing.deviceId || null,
                  templateData: typeof templateData === "undefined" ? existing.templateData : normalizedTemplateData,
                  employeeId: mappedEmployeeId,
                },
              })
            : await transaction.fingerprintMapping.create({
                data: {
                  deviceId: deviceId || null,
                  templateId: templateIdNumber,
                  templateData: normalizedTemplateData,
                  employeeId: mappedEmployeeId,
                },
              });

          if (
            !existing ||
            existing.deviceId !== savedMapping.deviceId ||
            existing.employeeId !== savedMapping.employeeId
          ) {
            await writeFingerprintMappingAudit(transaction, {
              action: existing ? "ENROLL_UPDATED" : "ENROLLED",
              templateId: templateIdNumber,
              deviceId: savedMapping.deviceId,
              previousEmployeeId: existing?.employeeId,
              employeeId: savedMapping.employeeId,
            });
          }

          if (pendingEmployee && savedMapping.employeeId === pendingEmployee.id) {
            await transaction.employee.updateMany({
              where: { id: pendingEmployee.id, pendingFingerprintId: templateIdNumber },
              data: { pendingFingerprintId: null },
            });
            await transaction.deviceCommand.create({
              data: {
                deviceId: savedMapping.deviceId || deviceId || "ESP32-01",
                command: "SYNC_NICKNAMES",
              },
            });
          }

          return savedMapping;
        });
        scheduleFingerprintMappingBackup("device-enroll");

        const state = await getAttendanceState();
        return NextResponse.json({
          ok: true,
          mapping,
          autoMapped: pendingEmployee !== null && mapping.employeeId === pendingEmployee.id,
          state,
        });
      } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "failed to save fingerprint" }, { status: 500 });
      }
    }

    // Device: checkin
    if (payload?.action === "deviceCheckin") {
      const key = request.headers.get("x-device-key");
      if (key !== process.env.DEVICE_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const { deviceId, templateId, employeeId } = payload;
      if (typeof templateId === "undefined") return NextResponse.json({ error: "templateId required" }, { status: 400 });

      const templateIdNumber = Number(templateId);
      if (!Number.isInteger(templateIdNumber) || templateIdNumber < 1 || templateIdNumber > 127) {
        return NextResponse.json({ error: "templateId invalid" }, { status: 400 });
      }
      let map = await prisma.fingerprintMapping.findUnique({ where: { templateId: templateIdNumber } });
      const rawEmployeeId =
        employeeId !== undefined && employeeId !== null && employeeId !== "" ? Number(employeeId) : null;

      if (rawEmployeeId !== null && (!Number.isInteger(rawEmployeeId) || rawEmployeeId < 1)) {
        return NextResponse.json({ error: "employeeId invalid" }, { status: 400 });
      }

      if (!map && rawEmployeeId !== null) {
        const employee = await prisma.employee.findUnique({ where: { id: rawEmployeeId } });
        if (!employee) return NextResponse.json({ error: "employee not found" }, { status: 404 });

        map = await prisma.$transaction(async (transaction) => {
          const createdMapping = await transaction.fingerprintMapping.create({
            data: {
              deviceId: deviceId || null,
              templateId: templateIdNumber,
              employeeId: rawEmployeeId,
              templateData: null,
            },
          });
          await writeFingerprintMappingAudit(transaction, {
            action: "ENROLLED_ON_CHECKIN",
            templateId: templateIdNumber,
            deviceId: createdMapping.deviceId,
            employeeId: createdMapping.employeeId,
          });
          return createdMapping;
        });
        scheduleFingerprintMappingBackup("device-checkin-created-mapping");
      }

      const resolvedEmployeeId = map?.employeeId ?? rawEmployeeId;
      if (!resolvedEmployeeId) {
        if (!map) {
          const discoveredMapping = await prisma.$transaction(async (transaction) => {
            const createdMapping = await transaction.fingerprintMapping.create({
              data: {
                deviceId: deviceId || null,
                templateId: templateIdNumber,
                employeeId: null,
                templateData: null,
              },
            });
            await writeFingerprintMappingAudit(transaction, {
              action: "DISCOVERED_ON_CHECKIN",
              templateId: templateIdNumber,
              deviceId: createdMapping.deviceId,
              employeeId: null,
            });
            return createdMapping;
          });
          map = discoveredMapping;
          scheduleFingerprintMappingBackup("unmapped-device-checkin");
        }
        await prisma.fingerprintVerificationLog.create({
          data: {
            deviceId: deviceId || null,
            templateId: templateIdNumber,
            status: "Belum dipetakan",
            note: "ID fingerprint dikenali sensor tetapi belum dihubungkan ke pegawai.",
            verifiedAt: new Date(),
          },
        });
        return NextResponse.json({ error: "Template not mapped to employee" }, { status: 404 });
      }

      const employee = await prisma.employee.findUnique({ where: { id: resolvedEmployeeId } });
      if (!employee) return NextResponse.json({ error: "employee not found" }, { status: 404 });
      const employeeWithNickname = employee as typeof employee & { nickname?: string };

      const checkedAt = new Date();
      const attendanceStatus = getFingerprintAttendanceStatus(checkedAt);
      if (!attendanceStatus) {
        return NextResponse.json({
          error: "Waktu scan di luar jadwal absensi (01:00-08:09 hadir, 08:10-16:49 terlambat, atau 16:50-19:00 pulang WITA).",
        }, { status: 400 });
      }
      const { start: startOfToday, end: startOfTomorrow } = getWitaDayBounds(checkedAt);
      const todayAttendance = await prisma.attendanceRecord.findFirst({
        where: {
          employeeId: employee.id,
            status: {
              in: (attendanceStatus === "Pulang" ? ["Pulang"] : ["Hadir", "Terlambat"]) as never,
            },
          checkedAt: { gte: startOfToday, lt: startOfTomorrow },
        },
        orderBy: { checkedAt: "desc" },
      });

      if (todayAttendance) {
        await prisma.fingerprintVerificationLog.create({
          data: {
            employeeId: employee.id,
            deviceId: deviceId || null,
            templateId: templateIdNumber,
            status: `${attendanceStatus} (Duplikat diblokir)`,
            note: `${attendanceStatus} sudah tercatat hari ini`,
            verifiedAt: checkedAt,
          },
        });
        return NextResponse.json({
          ok: true,
          skipped: true,
          employeeName: employeeWithNickname.nickname || employeeWithNickname.name,
          nickname: employeeWithNickname.nickname || employeeWithNickname.name,
          attendanceTime: todayAttendance.time,
          attendanceStatus,
          attendanceId: todayAttendance.id,
          message: `${attendanceStatus} sudah tercatat hari ini`,
          timestamp: todayAttendance.checkedAt,
        });
      }

      await prisma.attendanceRecord.create({
        data: {
          name: employee.name,
          time: getWitaTime(checkedAt),
          status: attendanceStatus as never,
          note: "-",
          checkedAt,
          employeeId: employee.id,
        },
      });

      await prisma.fingerprintVerificationLog.create({
        data: {
          employeeId: employee.id,
          deviceId: deviceId || null,
          templateId: templateIdNumber,
          status: attendanceStatus,
          note: `Verifikasi sidik jari berhasil via ESP32 (${deviceId || "unknown"})`,
          verifiedAt: checkedAt,
        },
      });

      return NextResponse.json({
        ok: true,
        employeeName: employeeWithNickname.nickname || employeeWithNickname.name,
        nickname: employeeWithNickname.nickname || employeeWithNickname.name,
        attendanceTime: getWitaTime(checkedAt),
        attendanceStatus,
      });
    }

    // Admin: map templateId -> employeeId
    if (payload?.action === "mapTemplate") {
      const { templateId, employeeId } = payload;
      if (typeof templateId === "undefined") return NextResponse.json({ error: "templateId required" }, { status: 400 });
      const templateIdNumber = Number(templateId);
      const employeeIdNumber = employeeId ? Number(employeeId) : null;
      if (!Number.isInteger(templateIdNumber) || templateIdNumber < 1 || templateIdNumber > 127) {
        return NextResponse.json({ error: "templateId invalid" }, { status: 400 });
      }
      if (employeeIdNumber !== null && (!Number.isInteger(employeeIdNumber) || employeeIdNumber < 1)) {
        return NextResponse.json({ error: "employeeId invalid" }, { status: 400 });
      }
      await prisma.$transaction(async (transaction) => {
        const existing = await transaction.fingerprintMapping.findUnique({ where: { templateId: templateIdNumber } });
        if (!existing) throw new Error(`Fingerprint mapping ${templateIdNumber} tidak ditemukan`);
        if (employeeIdNumber !== null) {
          const employee = await transaction.employee.findUnique({ where: { id: employeeIdNumber }, select: { id: true } });
          if (!employee) throw new Error(`Pegawai ${employeeIdNumber} tidak ditemukan`);
        }

        const updatedMapping = await transaction.fingerprintMapping.update({
          where: { templateId: templateIdNumber },
          data: { employeeId: employeeIdNumber },
        });
        if (existing.employeeId !== updatedMapping.employeeId) {
          await writeFingerprintMappingAudit(transaction, {
            action: employeeIdNumber === null ? "UNMAPPED" : "MAPPED",
            templateId: templateIdNumber,
            deviceId: updatedMapping.deviceId,
            previousEmployeeId: existing.employeeId,
            employeeId: updatedMapping.employeeId,
          });
        }
        if (employeeIdNumber !== null) {
          await transaction.employee.updateMany({
            where: { pendingFingerprintId: templateIdNumber },
            data: { pendingFingerprintId: null },
          });
        }
        await transaction.deviceCommand.create({
          data: {
            deviceId: updatedMapping.deviceId || "ESP32-01",
            command: "SYNC_NICKNAMES",
          },
        });
        return updatedMapping;
      });
      scheduleFingerprintMappingBackup("admin-map-template");
      const state = await getAttendanceState();
      return NextResponse.json({ ok: true, state });
    }

    if (payload?.action === "deleteMapping") {
      const templateId = Number(payload.templateId);
      if (!Number.isInteger(templateId) || templateId < 1 || templateId > 127) {
        return NextResponse.json({ error: "templateId invalid" }, { status: 400 });
      }
      if (payload.confirmation !== "DELETE_FINGERPRINT_MAPPING") {
        return NextResponse.json(
          { error: "Konfirmasi penghapusan mapping fingerprint tidak valid." },
          { status: 400 }
        );
      }
      const mapping = await prisma.fingerprintMapping.findUnique({ where: { templateId } });
      if (!mapping) return NextResponse.json({ error: "Mapping tidak ditemukan" }, { status: 404 });
      await prisma.$transaction(async (transaction) => {
        await transaction.deviceCommand.create({
          data: {
            deviceId: mapping.deviceId || "ESP32-01",
            command: "DELETE_FINGERPRINT",
            templateId,
          },
        });
        await writeFingerprintMappingAudit(transaction, {
          action: "DELETED",
          templateId,
          deviceId: mapping.deviceId,
          previousEmployeeId: mapping.employeeId,
          employeeId: mapping.employeeId,
        });
        await transaction.fingerprintMapping.delete({ where: { templateId } });
      });
      scheduleFingerprintMappingBackup("admin-delete-mapping");
      const state = await getAttendanceState();
      return NextResponse.json({ ok: true, state });
    }

    if (payload?.action === "deleteAllMappings") {
      console.warn("Blocked legacy deleteAllMappings request");
      return NextResponse.json(
        { error: "Penghapusan massal mapping dinonaktifkan untuk melindungi data." },
        { status: 410 }
      );
    }

    return NextResponse.json({ error: "unsupported action" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memproses request." },
      { status: 500 }
    );
  }
}
