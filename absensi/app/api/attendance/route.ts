import { NextResponse } from "next/server";
import { addAttendanceRecord, getAttendanceState, toggleAttendanceStatus, prisma } from "../../../lib/attendance-store";
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
    await prisma.fingerprintVerificationLog.deleteMany({
      where: {
        status: { contains: "Duplikat" },
        verifiedAt: { lt: new Date(Date.now() - 60 * 1000) },
      },
    });
    const state = await getAttendanceState();
    return NextResponse.json(state);
  } catch (error) {
    console.error("Error fetching attendance state:", error);
    return NextResponse.json(
      { error: "Database connection failed. Please ensure database is set up." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));

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

      await prisma.attendanceRecord.delete({ where: { id: recordId } }).catch(() => null);
      return NextResponse.json(await getAttendanceState());
    }

    if (payload?.action === "deleteVerificationLog") {
      const logId = Number(payload.logId);
      if (!Number.isInteger(logId) || logId < 1) {
        return NextResponse.json({ error: "logId invalid" }, { status: 400 });
      }

      await prisma.fingerprintVerificationLog.delete({ where: { id: logId } }).catch(() => null);
      return NextResponse.json(await getAttendanceState());
    }

    if (payload?.action === "deletePastAttendance") {
      const { start: today, end: tomorrow } = getWitaDayBounds(new Date());
      await prisma.$transaction([
        prisma.fingerprintVerificationLog.deleteMany({ where: { verifiedAt: { lt: today } } }),
        prisma.attendanceRecord.deleteMany({ where: { checkedAt: { lt: today } } }),
      ]);

      return NextResponse.json(await getAttendanceState());
    }

    if (payload?.action === "deleteTodayAttendance") {
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
      if (!Number.isInteger(templateIdNumber) || templateIdNumber < 0) {
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

      try {
        const existing = await prisma.fingerprintMapping.findUnique({ where: { templateId: templateIdNumber } });
        const normalizedTemplateData = normalizeFingerprintTemplate(templateData);
        const previousTemplateData = (existing as any)?.templateData ?? null;

        const mapping = existing
          ? await prisma.fingerprintMapping.update({
              where: { templateId: templateIdNumber },
              data: {
                deviceId: deviceId || existing.deviceId || null,
                templateData: typeof templateData === "undefined" ? previousTemplateData : normalizedTemplateData,
                employeeId: normalizedEmployeeId ?? existing.employeeId,
              },
            })
          : await prisma.fingerprintMapping.create({
              data: {
                deviceId: deviceId || null,
                templateId: templateIdNumber,
                templateData: normalizedTemplateData,
                employeeId: normalizedEmployeeId,
              },
            });

        const state = await getAttendanceState();
        return NextResponse.json({ ok: true, mapping, state });
      } catch (err: any) {
        console.error(err);
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

        map = await prisma.fingerprintMapping.create({
          data: {
            deviceId: deviceId || null,
            templateId: templateIdNumber,
            employeeId: rawEmployeeId,
            templateData: null,
          },
        });
      }

      const resolvedEmployeeId = map?.employeeId ?? rawEmployeeId;
      if (!resolvedEmployeeId) {
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
      const mapping = await prisma.fingerprintMapping.update({
        where: { templateId: templateIdNumber },
        data: { employeeId: employeeIdNumber },
      });
      if (employeeId) {
        await (prisma.employee as any).updateMany({ where: { pendingFingerprintId: templateIdNumber }, data: { pendingFingerprintId: null } });
      }
      await prisma.deviceCommand.create({
        data: {
          deviceId: mapping.deviceId || "ESP32-01",
          command: "SYNC_NICKNAMES",
        },
      });
      const state = await getAttendanceState();
      return NextResponse.json({ ok: true, state });
    }

    if (payload?.action === "deleteMapping") {
      const templateId = Number(payload.templateId);
      if (!Number.isInteger(templateId) || templateId < 1 || templateId > 127) {
        return NextResponse.json({ error: "templateId invalid" }, { status: 400 });
      }
      const mapping = await prisma.fingerprintMapping.findUnique({ where: { templateId } });
      if (!mapping) return NextResponse.json({ error: "Mapping tidak ditemukan" }, { status: 404 });
      await prisma.deviceCommand.create({
        data: {
          deviceId: mapping.deviceId || "ESP32-01",
          command: "DELETE_FINGERPRINT",
          templateId,
        },
      });
      await prisma.fingerprintMapping.delete({ where: { templateId } }).catch(() => null);
      if (mapping.employeeId) {
        await prisma.attendanceRecord.updateMany({ where: { employeeId: mapping.employeeId }, data: { employeeId: null } });
        await prisma.fingerprintVerificationLog.updateMany({ where: { employeeId: mapping.employeeId }, data: { employeeId: null } });
        await prisma.employee.delete({ where: { id: mapping.employeeId } }).catch(() => null);
      }
      const state = await getAttendanceState();
      return NextResponse.json({ ok: true, state });
    }

    if (payload?.action === "deleteAllMappings") {
      await prisma.fingerprintMapping.deleteMany({});
      const state = await getAttendanceState();
      return NextResponse.json({ ok: true, state });
    }

    return NextResponse.json({ error: "unsupported action" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Gagal memproses request" }, { status: 500 });
  }
}
