import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const backupRetentionDays = 365;
const backupPropertyName = "absensiBackup";
const backupPropertyValue = "full-operational";
const encryptionAad = Buffer.from("absensi-full-operational-backup-v1");

const tables = [
  {
    name: "employees",
    columns: ["id", "name", "nickname", "email", "department", "pendingFingerprintId", "createdAt", "updatedAt"],
    select: 'SELECT id, name, nickname, email, department, "pendingFingerprintId", "createdAt", "updatedAt" FROM employees ORDER BY id',
  },
  {
    name: "attendance_records",
    columns: ["id", "employeeId", "name", "time", "status", "note", "checkedAt", "createdAt"],
    select: 'SELECT id, "employeeId", name, time, status::text AS status, note, "checkedAt", "createdAt" FROM attendance_records ORDER BY id',
  },
  {
    name: "fingerprint_mappings",
    columns: ["id", "deviceId", "templateId", "employeeId", "createdAt"],
    select: 'SELECT id, "deviceId", "templateId", "employeeId", "createdAt" FROM fingerprint_mappings ORDER BY id',
  },
  {
    name: "fingerprint_mapping_audits",
    columns: ["id", "action", "templateId", "deviceId", "previousEmployeeId", "employeeId", "changedAt"],
    select: 'SELECT id, action, "templateId", "deviceId", "previousEmployeeId", "employeeId", "changedAt" FROM fingerprint_mapping_audits ORDER BY id',
  },
  {
    name: "fingerprint_verification_logs",
    columns: ["id", "employeeId", "deviceId", "templateId", "status", "note", "verifiedAt", "createdAt"],
    select: 'SELECT id, "employeeId", "deviceId", "templateId", status, note, "verifiedAt", "createdAt" FROM fingerprint_verification_logs ORDER BY id',
  },
  {
    name: "device_commands",
    columns: ["id", "deviceId", "command", "templateId", "status", "createdAt", "processedAt"],
    select: 'SELECT id, "deviceId", command, "templateId", status, "createdAt", "processedAt" FROM device_commands ORDER BY id',
  },
];

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required environment variable ${name} is missing.`);
  return value;
}

function getEncryptionKey() {
  const value = requiredEnvironment("BACKUP_ENCRYPTION_KEY");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new Error("BACKUP_ENCRYPTION_KEY must be canonical Base64 for exactly 32 random bytes.");
  }
  return key;
}

export function getDatabaseConfig(value) {
  const url = new URL(value);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol.");
  }
  if (!url.hostname || !url.pathname || url.pathname === "/") {
    throw new Error("DATABASE_URL must include a PostgreSQL host and database name.");
  }
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase())) {
    throw new Error("Refusing to run a production backup against a local database host.");
  }
  const sslMode = url.searchParams.get("sslmode");
  if (url.searchParams.get("ssl") !== "true" && sslMode !== "require" && sslMode !== "verify-full") {
    throw new Error(
      "PostgreSQL connection URL must enable verified TLS with ssl=true or sslmode=require."
    );
  }

  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    connectionTimeoutMillis: 15000,
    ssl: { rejectUnauthorized: true },
    // Keep timestamp(3) columns as raw "YYYY-MM-DD HH:MM:SS.mmm" strings (UTC), as the MySQL backup did.
    types: {
      getTypeParser: (oid, format) => (oid === 1114 ? (value) => value : pg.types.getTypeParser(oid, format)),
    },
  };
}

async function connectDatabase(config) {
  const client = new pg.Client(config);
  await client.connect();
  return client;
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function encryptBackup(snapshot, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(encryptionAad);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(snapshot), "utf8"),
    cipher.final(),
  ]);

  return Buffer.from(JSON.stringify({
    format: "absensi-full-operational-backup",
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  }));
}

export function decryptBackup(encrypted, key) {
  const envelope = JSON.parse(Buffer.from(encrypted).toString("utf8"));
  if (
    envelope?.format !== "absensi-full-operational-backup" ||
    envelope.version !== 1 ||
    typeof envelope.iv !== "string" ||
    typeof envelope.tag !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    throw new Error("Encrypted backup format is invalid or unsupported.");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(encryptionAad);
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const snapshot = JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8"));

  if (
    snapshot?.format !== "absensi-full-operational-backup" ||
    snapshot.version !== 1 ||
    !snapshot.createdAt ||
    !snapshot.source?.host ||
    !Number.isInteger(snapshot.source?.port) ||
    !snapshot.source?.database ||
    !snapshot.tables ||
    snapshot.sha256 !== sha256({
      format: snapshot.format,
      version: snapshot.version,
      createdAt: snapshot.createdAt,
      source: snapshot.source,
      included: snapshot.included,
      excluded: snapshot.excluded,
      tables: snapshot.tables,
    })
  ) {
    throw new Error("Backup checksum or snapshot structure is invalid.");
  }

  validateSnapshotForBackup(snapshot);
  return snapshot;
}

export function assertRestoreTargetIsDifferent(snapshot, target) {
  if (
    snapshot.source.host.toLowerCase() === target.host.toLowerCase() &&
    snapshot.source.port === target.port &&
    snapshot.source.database.toLowerCase() === target.database.toLowerCase()
  ) {
    throw new Error("Restore refused: target database matches the backup source.");
  }
}

export function assertExpectedBackupTarget(config, expected) {
  if (
    !expected.host ||
    !Number.isInteger(expected.port) ||
    expected.port < 1 ||
    !expected.database
  ) {
    throw new Error(
      "Expected backup database target is not configured. Set BACKUP_EXPECTED_DATABASE_HOST, BACKUP_EXPECTED_DATABASE_PORT, and BACKUP_EXPECTED_DATABASE_NAME."
    );
  }
  if (
    config.host.toLowerCase() !== expected.host.toLowerCase() ||
    config.port !== expected.port ||
    config.database.toLowerCase() !== expected.database.toLowerCase()
  ) {
    throw new Error("Backup DATABASE_URL does not match the pinned database target.");
  }
}

export function validateSnapshotForBackup(snapshot) {
  for (const table of tables) {
    if (!Array.isArray(snapshot.tables?.[table.name])) {
      throw new Error(`Backup table ${table.name} is missing or invalid.`);
    }
  }

  const { employees, attendance_records, fingerprint_mappings } = snapshot.tables;
  if (employees.length === 0 && attendance_records.length === 0 && fingerprint_mappings.length === 0) {
    throw new Error(
      "Refusing to save an empty operational backup; verify the database target before continuing."
    );
  }

  const employeeIds = new Set(employees.map((employee) => Number(employee.id)));
  for (const mapping of fingerprint_mappings) {
    if (
      mapping.employeeId !== null &&
      mapping.employeeId !== undefined &&
      !employeeIds.has(Number(mapping.employeeId))
    ) {
      throw new Error(
        `Backup integrity check failed: fingerprint template ${mapping.templateId} references a missing employee.`
      );
    }
  }
  for (const record of attendance_records) {
    if (
      record.employeeId !== null &&
      record.employeeId !== undefined &&
      !employeeIds.has(Number(record.employeeId))
    ) {
      throw new Error(
        `Backup integrity check failed: attendance record ${record.id} references a missing employee.`
      );
    }
  }
}

async function createSnapshot(connection, config) {
  await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const { rows: [identity] } = await connection.query('SELECT current_database() AS "databaseName"');
    if (!identity?.databaseName) throw new Error("Could not determine the source database name.");

    const snapshotTables = {};
    for (const table of tables) {
      const { rows } = await connection.query(table.select);
      snapshotTables[table.name] = rows;
    }

    const contents = {
      format: "absensi-full-operational-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      source: {
        host: config.host,
        port: config.port,
        database: String(identity.databaseName),
      },
      included: [
        "employee profiles",
        "attendance records",
        "fingerprint mappings without biometric template data",
        "fingerprint mapping audit history",
        "fingerprint verification logs",
        "device commands",
      ],
      excluded: [
        "biometric fingerprint template data",
        "WebAuthn credentials and public keys",
      ],
      tables: snapshotTables,
    };
    const snapshot = { ...contents, sha256: sha256(contents) };
    validateSnapshotForBackup(snapshot);
    return snapshot;
  } finally {
    await connection.query("ROLLBACK");
  }
}

async function getAccessToken() {
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
  if (!response.ok) throw new Error(`Google OAuth token refresh failed (HTTP ${response.status}).`);
  const payload = await response.json();
  if (typeof payload.access_token !== "string") throw new Error("Google OAuth returned no access token.");
  return payload.access_token;
}

async function driveRequest(accessToken, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Google Drive request failed (HTTP ${response.status}).`);
  if (response.status === 204) return undefined;
  return response.json();
}

async function uploadBackup(accessToken, snapshot, key) {
  const boundary = `absensi_${randomBytes(18).toString("hex")}`;
  const createdStamp = snapshot.createdAt.replace(/[:.]/g, "-");
  const metadata = {
    name: `absensi-operational-daily-${createdStamp}.json.enc`,
    mimeType: "application/octet-stream",
    appProperties: {
      [backupPropertyName]: backupPropertyValue,
      backupKind: "daily-operational",
      version: "1",
    },
  };
  const encrypted = encryptBackup(snapshot, key);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    encrypted,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  return driveRequest(
    accessToken,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,size,appProperties",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    }
  );
}

async function listBackups(accessToken) {
  const files = [];
  let pageToken;
  do {
    const params = new URLSearchParams({
      q: `appProperties has { key='${backupPropertyName}' and value='${backupPropertyValue}' } and trashed=false`,
      spaces: "drive",
      orderBy: "createdTime desc",
      pageSize: "1000",
      fields: "nextPageToken,files(id,name,createdTime)",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await driveRequest(accessToken, `https://www.googleapis.com/drive/v3/files?${params}`);
    files.push(...(page.files ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return files;
}

async function pruneExpiredBackups(accessToken, now) {
  const cutoff = now.getTime() - backupRetentionDays * 24 * 60 * 60 * 1000;
  const expired = (await listBackups(accessToken))
    .filter((file) => Date.parse(file.createdTime) < cutoff);
  for (const file of expired) {
    await driveRequest(
      accessToken,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`,
      { method: "DELETE" }
    );
  }
  return expired.length;
}

export async function runBackup() {
  const key = getEncryptionKey();
  const databaseConfig = getDatabaseConfig(requiredEnvironment("DATABASE_URL"));
  assertExpectedBackupTarget(databaseConfig, {
    host: requiredEnvironment("BACKUP_EXPECTED_DATABASE_HOST"),
    port: Number(requiredEnvironment("BACKUP_EXPECTED_DATABASE_PORT")),
    database: requiredEnvironment("BACKUP_EXPECTED_DATABASE_NAME"),
  });
  const connection = await connectDatabase(databaseConfig);
  try {
    const snapshot = await createSnapshot(connection, databaseConfig);
    const accessToken = await getAccessToken();
    const uploaded = await uploadBackup(accessToken, snapshot, key);
    const uploadedContent = await downloadBackup(accessToken, uploaded.id);
    const verifiedSnapshot = decryptBackup(uploadedContent, key);
    if (verifiedSnapshot.sha256 !== snapshot.sha256) {
      throw new Error("Uploaded Drive backup failed post-upload integrity verification.");
    }
    const expiredCount = await pruneExpiredBackups(accessToken, new Date(snapshot.createdAt));
    const counts = Object.fromEntries(tables.map((table) => [table.name, snapshot.tables[table.name].length]));
    console.info("Encrypted operational backup uploaded.", {
      backupId: uploaded.id,
      createdAt: snapshot.createdAt,
      counts,
      expiredBackupsDeleted: expiredCount,
    });
    return { id: uploaded.id, counts };
  } finally {
    await connection.end();
  }
}

async function downloadBackup(accessToken, fileId) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(60000),
    }
  );
  if (!response.ok) throw new Error(`Could not download selected Drive backup (HTTP ${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

async function restoreSnapshot(connection, snapshot) {
  const { rows: targetTables } = await connection.query(
    "SELECT table_name AS \"tableName\" FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'"
  );
  const targetTableNames = new Set(targetTables.map((row) => String(row.tableName)));
  for (const table of tables) {
    if (!targetTableNames.has(table.name)) {
      throw new Error(`Restore refused: required target table ${table.name} is missing; apply migrations first.`);
    }
  }

  for (const tableName of targetTableNames) {
    if (tableName === "_prisma_migrations") continue;
    const escapedTableName = tableName.replaceAll('"', '""');
    const { rows: [row] } = await connection.query(`SELECT COUNT(*) AS "rowCount" FROM "${escapedTableName}"`);
    if (Number(row.rowCount) !== 0) {
      throw new Error(`Restore refused: target table ${tableName} is not empty.`);
    }
  }

  await connection.query("BEGIN");
  try {
    for (const table of tables) {
      const rows = snapshot.tables[table.name];
      if (rows.length === 0) continue;
      const columns = table.columns.map((column) => `"${column}"`).join(", ");
      const placeholders = table.columns.map((_, index) => `$${index + 1}`).join(", ");
      const query = `INSERT INTO "${table.name}" (${columns}) VALUES (${placeholders})`;
      for (const row of rows) {
        await connection.query(query, table.columns.map((column) => row[column] ?? null));
      }
      // Explicit ids were inserted, so move the serial sequence past them.
      await connection.query(
        `SELECT setval(pg_get_serial_sequence('"${table.name}"', 'id'), (SELECT MAX(id) FROM "${table.name}"))`
      );
    }
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  }
}

export async function runRestore(fileId) {
  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    throw new Error("A valid Google Drive backup file ID is required.");
  }
  const key = getEncryptionKey();
  const targetConfig = getDatabaseConfig(requiredEnvironment("RESTORE_DATABASE_URL"));
  const accessToken = await getAccessToken();
  const encrypted = await downloadBackup(accessToken, fileId);
  const snapshot = decryptBackup(encrypted, key);
  assertRestoreTargetIsDifferent(snapshot, targetConfig);
  const connection = await connectDatabase(targetConfig);
  try {
    await restoreSnapshot(connection, snapshot);
    console.info("Operational backup restored to an empty target database.", {
      backupId: fileId,
      backupCreatedAt: snapshot.createdAt,
      source: snapshot.source,
      target: { host: targetConfig.host, database: targetConfig.database },
      counts: Object.fromEntries(tables.map((table) => [table.name, snapshot.tables[table.name].length])),
    });
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [command, fileId] = process.argv.slice(2);
  if (command === "backup") {
    await runBackup();
  } else if (command === "restore") {
    await runRestore(fileId);
  } else {
    throw new Error("Usage: node scripts/operational-backup.mjs backup | restore <drive-file-id>");
  }
}
