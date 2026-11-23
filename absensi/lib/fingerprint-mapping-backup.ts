import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { after } from "next/server";
import { prisma } from "./attendance-store";

const backupRetentionDays = 365;
const activityWindowDays = 8;
const encryptionAad = Buffer.from("absensi-fingerprint-mapping-backup-v1");
const driveProperties = "appProperties has { key='absensiBackup' and value='fingerprint-mappings' } and trashed=false";

type DatabaseIdentity = {
  host: string;
  database: string;
};

type BackupEmployee = {
  id: number;
  name: string;
  nickname: string;
  email: string;
  department: string;
  pendingFingerprintId: number | null;
  createdAt: string;
  updatedAt: string;
};

type BackupMapping = {
  templateId: number;
  deviceId: string | null;
  employeeId: number | null;
  createdAt: string;
};

type BackupVerificationLog = {
  employeeId: number | null;
  deviceId: string | null;
  templateId: number;
  status: string;
  note: string | null;
  verifiedAt: string;
  createdAt: string;
};

export type FingerprintMappingSnapshot = {
  version: 1;
  kind: "mapping-change" | "weekly";
  createdAt: string;
  source: DatabaseIdentity;
  activityWindow: { from: string; to: string } | null;
  employees: BackupEmployee[];
  mappings: BackupMapping[];
  verificationLogs: BackupVerificationLog[];
  sha256: string;
};

type DriveFile = {
  id: string;
  name: string;
  createdTime: string;
  size?: string;
  appProperties?: Record<string, string>;
};

export class EmptyFingerprintMappingBackupError extends Error {
  constructor() {
    super("Database tidak memiliki mapping; backup kosong tidak disimpan.");
    this.name = "EmptyFingerprintMappingBackupError";
  }
}

export class FingerprintBackupConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FingerprintBackupConfigurationError";
  }
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new FingerprintBackupConfigurationError(`Environment ${name} belum disetel.`);
  return value;
}

function getEncryptionKey() {
  const value = requiredEnvironment("BACKUP_ENCRYPTION_KEY");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new FingerprintBackupConfigurationError(
      "BACKUP_ENCRYPTION_KEY harus berupa Base64 dari tepat 32 byte acak."
    );
  }
  return key;
}

async function getGoogleAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnvironment("GOOGLE_DRIVE_CLIENT_ID"),
      client_secret: requiredEnvironment("GOOGLE_DRIVE_CLIENT_SECRET"),
      refresh_token: requiredEnvironment("GOOGLE_DRIVE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new FingerprintBackupConfigurationError(
      `Google OAuth menolak refresh token (HTTP ${response.status}). Periksa konfigurasi OAuth di Vercel.`
    );
  }
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("Google OAuth tidak memberikan access token.");
  return payload.access_token;
}

async function driveRequest<T>(accessToken: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(`Google Drive API gagal (HTTP ${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

type DatabaseQueryClient = Pick<typeof prisma, "$queryRaw">;

async function getDatabaseIdentity(client: DatabaseQueryClient): Promise<DatabaseIdentity> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new FingerprintBackupConfigurationError("DATABASE_URL belum disetel.");
  const url = new URL(databaseUrl);
  const rows = await client.$queryRaw<Array<{ databaseName: string | null }>>`SELECT current_database() AS "databaseName"`;
  if (!url.hostname || !rows[0]?.databaseName) throw new Error("Identitas database tidak dapat dipastikan.");
  return { host: url.hostname, database: String(rows[0].databaseName) };
}

function checksum(snapshot: Omit<FingerprintMappingSnapshot, "sha256">) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function encryptSnapshot(snapshot: FingerprintMappingSnapshot) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  cipher.setAAD(encryptionAad);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(snapshot), "utf8"),
    cipher.final(),
  ]);
  return Buffer.from(JSON.stringify({
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  }));
}

function decryptSnapshot(input: Uint8Array): FingerprintMappingSnapshot {
  const envelope = JSON.parse(Buffer.from(input).toString("utf8")) as {
    version?: number;
    iv?: string;
    tag?: string;
    ciphertext?: string;
  };
  if (envelope.version !== 1 || !envelope.iv || !envelope.tag || !envelope.ciphertext) {
    throw new Error("Format backup terenkripsi tidak dikenal.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(encryptionAad);
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  const snapshot = JSON.parse(plaintext.toString("utf8")) as FingerprintMappingSnapshot;
  validateSnapshot(snapshot);
  return snapshot;
}

function validateSnapshot(snapshot: FingerprintMappingSnapshot) {
  if (
    snapshot?.version !== 1 ||
    !["mapping-change", "weekly"].includes(snapshot.kind) ||
    !snapshot.source?.host ||
    !snapshot.source?.database ||
    !Array.isArray(snapshot.employees) ||
    !Array.isArray(snapshot.mappings) ||
    !Array.isArray(snapshot.verificationLogs) ||
    !snapshot.createdAt ||
    snapshot.sha256 !== checksum({
      version: snapshot.version,
      kind: snapshot.kind,
      createdAt: snapshot.createdAt,
      source: snapshot.source,
      activityWindow: snapshot.activityWindow,
      employees: snapshot.employees,
      mappings: snapshot.mappings,
      verificationLogs: snapshot.verificationLogs,
    })
  ) {
    throw new Error("Checksum atau struktur backup tidak valid.");
  }
  if (snapshot.mappings.length === 0) throw new EmptyFingerprintMappingBackupError();
  if (snapshot.kind === "weekly" && !snapshot.activityWindow) {
    throw new Error("Backup mingguan tidak menyertakan rentang log verifikasi.");
  }
  if (snapshot.kind === "mapping-change" && snapshot.verificationLogs.length > 0) {
    throw new Error("Snapshot perubahan mapping tidak boleh memuat log verifikasi.");
  }

  const employeeIds = new Set<number>();
  const employeeEmails = new Set<string>();
  for (const employee of snapshot.employees) {
    if (
      !Number.isInteger(employee.id) ||
      employee.id < 1 ||
      typeof employee.name !== "string" ||
      typeof employee.nickname !== "string" ||
      typeof employee.email !== "string" ||
      typeof employee.department !== "string" ||
      !employee.createdAt ||
      !employee.updatedAt ||
      employeeIds.has(employee.id) ||
      employeeEmails.has(employee.email.toLowerCase()) ||
      (employee.pendingFingerprintId !== null &&
        (!Number.isInteger(employee.pendingFingerprintId) ||
          employee.pendingFingerprintId < 1 ||
          employee.pendingFingerprintId > 127))
    ) {
      throw new Error("Data pegawai di backup tidak valid atau duplikat.");
    }
    employeeIds.add(employee.id);
    employeeEmails.add(employee.email.toLowerCase());
  }

  const templateIds = new Set<number>();
  for (const mapping of snapshot.mappings) {
    if (
      !Number.isInteger(mapping.templateId) ||
      mapping.templateId < 1 ||
      mapping.templateId > 127 ||
      (mapping.employeeId !== null && !employeeIds.has(mapping.employeeId)) ||
      !mapping.createdAt ||
      templateIds.has(mapping.templateId)
    ) {
      throw new Error("Data mapping di backup tidak valid, duplikat, atau merujuk pegawai yang tidak ada.");
    }
    templateIds.add(mapping.templateId);
  }

  for (const log of snapshot.verificationLogs) {
    if (
      !Number.isInteger(log.templateId) ||
      log.templateId < 1 ||
      log.templateId > 127 ||
      typeof log.status !== "string" ||
      !log.verifiedAt ||
      !log.createdAt
    ) {
      throw new Error("Log verifikasi di backup tidak valid.");
    }
  }
}

async function listDriveFiles(accessToken: string) {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: driveProperties,
      spaces: "drive",
      orderBy: "createdTime desc",
      pageSize: "1000",
      fields: "nextPageToken,files(id,name,createdTime,size,appProperties)",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await driveRequest<{ files?: DriveFile[]; nextPageToken?: string }>(
      accessToken,
      `https://www.googleapis.com/drive/v3/files?${params}`
    );
    files.push(...(page.files ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return files;
}

async function uploadSnapshot(accessToken: string, snapshot: FingerprintMappingSnapshot) {
  const boundary = `absensi_${randomBytes(18).toString("hex")}`;
  const metadata = {
    name: `absensi-fingerprint-${snapshot.kind}-${snapshot.createdAt.replace(/[:.]/g, "-")}.json.enc`,
    mimeType: "application/octet-stream",
    appProperties: {
      absensiBackup: "fingerprint-mappings",
      backupKind: snapshot.kind,
      version: "1",
    },
  };
  const encrypted = encryptSnapshot(snapshot);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    encrypted,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  return await driveRequest<DriveFile>(
    accessToken,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,size,appProperties",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    }
  );
}

async function pruneOldDriveBackups(accessToken: string, now: Date) {
  const cutoff = now.getTime() - backupRetentionDays * 24 * 60 * 60 * 1000;
  const files = await listDriveFiles(accessToken);
  const expired = files.filter((file) => Date.parse(file.createdTime) < cutoff);
  for (let offset = 0; offset < expired.length; offset += 100) {
    await Promise.all(expired.slice(offset, offset + 100).map((file) =>
      driveRequest<void>(accessToken, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`, {
        method: "DELETE",
      })
    ));
  }
}

export async function createFingerprintMappingBackup(kind: FingerprintMappingSnapshot["kind"] = "mapping-change") {
  const accessToken = await getGoogleAccessToken();
  const now = new Date();
  const snapshot = await prisma.$transaction(async (transaction) => {
    const source = await getDatabaseIdentity(transaction);
    const [employees, mappings, logs] = await Promise.all([
      transaction.employee.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          name: true,
          nickname: true,
          email: true,
          department: true,
          pendingFingerprintId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      transaction.fingerprintMapping.findMany({
        orderBy: { templateId: "asc" },
        select: { templateId: true, deviceId: true, employeeId: true, createdAt: true },
      }),
      kind === "weekly"
        ? transaction.fingerprintVerificationLog.findMany({
          where: {
            verifiedAt: { gte: new Date(now.getTime() - activityWindowDays * 24 * 60 * 60 * 1000), lte: now },
          },
          orderBy: [{ verifiedAt: "asc" }, { id: "asc" }],
          select: {
            employeeId: true,
            deviceId: true,
            templateId: true,
            status: true,
            note: true,
            verifiedAt: true,
            createdAt: true,
          },
        })
        : Promise.resolve([]),
    ]);

    const contents: Omit<FingerprintMappingSnapshot, "sha256"> = {
      version: 1,
      kind,
      createdAt: now.toISOString(),
      source,
      activityWindow: kind === "weekly"
        ? { from: new Date(now.getTime() - activityWindowDays * 24 * 60 * 60 * 1000).toISOString(), to: now.toISOString() }
        : null,
      employees: employees.map((employee) => ({
        ...employee,
        createdAt: employee.createdAt.toISOString(),
        updatedAt: employee.updatedAt.toISOString(),
      })),
      mappings: mappings.map((mapping) => ({
        ...mapping,
        createdAt: mapping.createdAt.toISOString(),
      })),
      verificationLogs: logs.map((log) => ({
        ...log,
        verifiedAt: log.verifiedAt.toISOString(),
        createdAt: log.createdAt.toISOString(),
      })),
    };
    return { ...contents, sha256: checksum(contents) };
  }, { isolationLevel: "RepeatableRead" });

  validateSnapshot(snapshot);
  if (!snapshot.mappings.length) throw new EmptyFingerprintMappingBackupError();
  const uploaded = await uploadSnapshot(accessToken, snapshot);
  await pruneOldDriveBackups(accessToken, now);
  return {
    id: uploaded.id,
    name: uploaded.name,
    kind,
    employees: snapshot.employees.length,
    mappings: snapshot.mappings.length,
    verificationLogs: snapshot.verificationLogs.length,
    createdAt: snapshot.createdAt,
  };
}

export function scheduleFingerprintMappingBackup(reason: string) {
  after(async () => {
    try {
      const result = await createFingerprintMappingBackup("mapping-change");
      console.info("Fingerprint mapping backup saved after change.", {
        reason,
        mappings: result.mappings,
        employees: result.employees,
      });
    } catch (error) {
      if (error instanceof EmptyFingerprintMappingBackupError) {
        console.warn("Fingerprint mapping backup skipped because no mappings remain.", { reason });
        return;
      }
      console.error("Fingerprint mapping backup after change failed.", {
        reason,
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }
  });
}

export async function listFingerprintMappingBackups() {
  const accessToken = await getGoogleAccessToken();
  const files = await listDriveFiles(accessToken);
  return files.map((file) => ({
    id: file.id,
    name: file.name,
    createdAt: file.createdTime,
    bytes: file.size ? Number(file.size) : null,
    kind: file.appProperties?.backupKind ?? "unknown",
  }));
}

export async function downloadFingerprintMappingBackup(fileId: string) {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) throw new Error("ID file backup tidak valid.");
  const accessToken = await getGoogleAccessToken();
  const params = new URLSearchParams({ alt: "media" });
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30000) }
  );
  if (!response.ok) throw new Error(`Google Drive gagal mengunduh backup (HTTP ${response.status}).`);
  return decryptSnapshot(new Uint8Array(await response.arrayBuffer()));
}

type RestorePlan = {
  target: DatabaseIdentity;
  databaseMatches: boolean;
  missingEmployees: BackupEmployee[];
  missingMappings: BackupMapping[];
  restorePendingRegistrations: Array<{ employeeId: number; templateId: number }>;
  fillUnmapped: Array<{ currentId: number; currentDeviceId: string | null; mapping: BackupMapping }>;
  missingVerificationLogs: BackupVerificationLog[];
};

async function createRestorePlan(
  snapshot: FingerprintMappingSnapshot,
  allowDifferentDatabase = false
): Promise<RestorePlan> {
  const identity = await getDatabaseIdentity(prisma);
  const databaseMatches = snapshot.source.host === identity.host && snapshot.source.database === identity.database;
  if (!databaseMatches && !allowDifferentDatabase) {
    throw new Error("Database target berbeda dari database asal backup; pemulihan dibatalkan.");
  }

  const [currentEmployees, currentEmailOwners, currentMappings] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: snapshot.employees.map((employee) => employee.id) } },
      select: { id: true, email: true, pendingFingerprintId: true },
    }),
    prisma.employee.findMany({
      where: { email: { in: snapshot.employees.map((employee) => employee.email) } },
      select: { id: true, email: true },
    }),
    prisma.fingerprintMapping.findMany({
      where: { templateId: { in: snapshot.mappings.map((mapping) => mapping.templateId) } },
      select: { id: true, templateId: true, deviceId: true, employeeId: true },
    }),
  ]);

  const employeesById = new Map(currentEmployees.map((employee) => [employee.id, employee]));
  const emailOwners = new Map(currentEmailOwners.map((employee) => [employee.email.toLowerCase(), employee]));
  const mappingsByTemplate = new Map(currentMappings.map((mapping) => [mapping.templateId, mapping]));
  const missingEmployees = snapshot.employees.filter((employee) => !employeesById.has(employee.id));
  const restorePendingRegistrations: RestorePlan["restorePendingRegistrations"] = [];

  for (const employee of snapshot.employees) {
    const current = employeesById.get(employee.id);
    const owner = emailOwners.get(employee.email.toLowerCase());
    if (current && current.email.toLowerCase() !== employee.email.toLowerCase()) {
      throw new Error(`ID pegawai ${employee.id} saat ini memiliki email berbeda; pemulihan dibatalkan.`);
    }
    if (!current && owner && owner.id !== employee.id) {
      throw new Error(`Email pegawai ID ${employee.id} sudah dimiliki ID ${owner.id}; pemulihan dibatalkan.`);
    }
    if (
      current?.pendingFingerprintId !== null &&
      current?.pendingFingerprintId !== undefined &&
      employee.pendingFingerprintId !== current.pendingFingerprintId
    ) {
      throw new Error(`Pendaftaran tertunda pegawai ${employee.id} berbeda; pemulihan dibatalkan.`);
    }
    if (current && current.pendingFingerprintId === null && employee.pendingFingerprintId !== null) {
      restorePendingRegistrations.push({ employeeId: employee.id, templateId: employee.pendingFingerprintId });
    }
  }

  const pendingIds = snapshot.employees
    .map((employee) => employee.pendingFingerprintId)
    .filter((id): id is number => id !== null);
  const otherPendingOwners = pendingIds.length
    ? await prisma.employee.findMany({
      where: {
        pendingFingerprintId: { in: pendingIds },
        id: { notIn: snapshot.employees.map((employee) => employee.id) },
      },
      select: { id: true },
    })
    : [];
  if (otherPendingOwners.length) throw new Error("ID pendaftaran tertunda dimiliki pegawai lain; pemulihan dibatalkan.");

  const missingMappings: BackupMapping[] = [];
  const fillUnmapped: RestorePlan["fillUnmapped"] = [];
  for (const mapping of snapshot.mappings) {
    const current = mappingsByTemplate.get(mapping.templateId);
    if (!current) missingMappings.push(mapping);
    else if (current.employeeId !== mapping.employeeId && current.employeeId !== null) {
      throw new Error(`Template ${mapping.templateId} sudah terhubung ke pegawai berbeda; pemulihan dibatalkan.`);
    } else if (current.employeeId === null && mapping.employeeId !== null) {
      fillUnmapped.push({ currentId: current.id, currentDeviceId: current.deviceId, mapping });
    }
  }

  const missingVerificationLogs: BackupVerificationLog[] = [];
  if (snapshot.verificationLogs.length && snapshot.activityWindow) {
    const existingLogs = await prisma.fingerprintVerificationLog.findMany({
      where: {
        verifiedAt: { gte: new Date(snapshot.activityWindow.from), lte: new Date(snapshot.activityWindow.to) },
      },
      select: { employeeId: true, templateId: true, status: true, verifiedAt: true },
    });
    const existingKeys = new Set(existingLogs.map((log) =>
      `${log.employeeId ?? "null"}|${log.templateId}|${log.status}|${log.verifiedAt.toISOString()}`
    ));
    missingVerificationLogs.push(...snapshot.verificationLogs.filter((log) =>
      !existingKeys.has(`${log.employeeId ?? "null"}|${log.templateId}|${log.status}|${new Date(log.verifiedAt).toISOString()}`)
    ));
  }

  return {
    target: identity,
    databaseMatches,
    missingEmployees,
    missingMappings,
    restorePendingRegistrations,
    fillUnmapped,
    missingVerificationLogs,
  };
}

export async function previewFingerprintMappingRestore(fileId: string, allowDifferentDatabase = false) {
  const snapshot = await downloadFingerprintMappingBackup(fileId);
  const plan = await createRestorePlan(snapshot, allowDifferentDatabase);
  return {
    fileId,
    kind: snapshot.kind,
    createdAt: snapshot.createdAt,
    activityWindow: snapshot.activityWindow,
    databaseSource: snapshot.source,
    databaseTarget: plan.target,
    databaseMatches: plan.databaseMatches,
    employeesInBackup: snapshot.employees.length,
    mappingsInBackup: snapshot.mappings.length,
    verificationLogsInBackup: snapshot.verificationLogs.length,
    employeesToAdd: plan.missingEmployees.length,
    mappingsToAdd: plan.missingMappings.length,
    mappingsToReconnect: plan.fillUnmapped.length,
    pendingRegistrationsToRestore: plan.restorePendingRegistrations.length,
    verificationLogsToAdd: plan.missingVerificationLogs.length,
  };
}

export async function restoreFingerprintMappings(fileId: string, allowDifferentDatabase = false) {
  const snapshot = await downloadFingerprintMappingBackup(fileId);
  const plan = await createRestorePlan(snapshot, allowDifferentDatabase);

  await prisma.$transaction(async (transaction) => {
    for (const employee of plan.missingEmployees) {
      await transaction.employee.create({
        data: {
          id: employee.id,
          name: employee.name,
          nickname: employee.nickname,
          email: employee.email,
          department: employee.department,
          pendingFingerprintId: employee.pendingFingerprintId,
          createdAt: new Date(employee.createdAt),
          updatedAt: new Date(employee.updatedAt),
        },
      });
    }
    for (const registration of plan.restorePendingRegistrations) {
      await transaction.employee.update({
        where: { id: registration.employeeId },
        data: { pendingFingerprintId: registration.templateId },
      });
    }
    for (const mapping of plan.missingMappings) {
      if (await transaction.fingerprintMapping.findUnique({ where: { templateId: mapping.templateId } })) {
        throw new Error(`Template ${mapping.templateId} berubah setelah pemeriksaan; transaksi dibatalkan.`);
      }
      await transaction.fingerprintMapping.create({
        data: {
          templateId: mapping.templateId,
          deviceId: mapping.deviceId,
          employeeId: mapping.employeeId,
          createdAt: new Date(mapping.createdAt),
        },
      });
      await transaction.fingerprintMappingAudit.create({
        data: {
          action: "RESTORED",
          templateId: mapping.templateId,
          deviceId: mapping.deviceId,
          employeeId: mapping.employeeId,
        },
      });
    }
    for (const item of plan.fillUnmapped) {
      const current = await transaction.fingerprintMapping.findUnique({ where: { id: item.currentId } });
      if (!current || current.employeeId !== null) {
        throw new Error(`Template ${item.mapping.templateId} berubah setelah pemeriksaan; transaksi dibatalkan.`);
      }
      await transaction.fingerprintMapping.update({
        where: { id: item.currentId },
        data: { employeeId: item.mapping.employeeId },
      });
      await transaction.fingerprintMappingAudit.create({
        data: {
          action: "RESTORED",
          templateId: item.mapping.templateId,
          deviceId: item.currentDeviceId || item.mapping.deviceId,
          previousEmployeeId: null,
          employeeId: item.mapping.employeeId,
        },
      });
    }

    const window = snapshot.activityWindow;
    const logBatchSize = 500;
    for (let offset = 0; offset < plan.missingVerificationLogs.length; offset += logBatchSize) {
      const logs = plan.missingVerificationLogs.slice(offset, offset + logBatchSize);
      await transaction.fingerprintVerificationLog.createMany({
        data: logs.map((log) => ({
          employeeId: log.employeeId,
          deviceId: log.deviceId,
          templateId: log.templateId,
          status: log.status,
          note: log.note,
          verifiedAt: new Date(log.verifiedAt),
          createdAt: new Date(log.createdAt),
        })),
        skipDuplicates: true,
      });
    }
    if (snapshot.kind === "weekly" && window && plan.missingVerificationLogs.length === 0) {
      const logsInWindow = await transaction.fingerprintVerificationLog.count({
        where: { verifiedAt: { gte: new Date(window.from), lte: new Date(window.to) } },
      });
      if (logsInWindow === 0 && snapshot.verificationLogs.length > 0) {
        throw new Error("Tidak ada log verifikasi yang dipulihkan; transaksi dibatalkan.");
      }
    }
  }, { isolationLevel: "Serializable" });

  return {
    employeesAdded: plan.missingEmployees.length,
    mappingsAdded: plan.missingMappings.length,
    mappingsReconnected: plan.fillUnmapped.length,
    pendingRegistrationsRestored: plan.restorePendingRegistrations.length,
    verificationLogsAdded: plan.missingVerificationLogs.length,
    verificationWindow: snapshot.activityWindow,
  };
}
