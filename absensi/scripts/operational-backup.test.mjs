import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import {
  assertExpectedBackupTarget,
  assertRestoreTargetIsDifferent,
  decryptBackup,
  encryptBackup,
  getDatabaseConfig,
  validateSnapshotForBackup,
} from "./operational-backup.mjs";

const emptyTables = {
  employees: [],
  attendance_records: [],
  fingerprint_mappings: [],
  fingerprint_mapping_audits: [],
  fingerprint_verification_logs: [],
  device_commands: [],
};

function createSnapshot(tables = emptyTables) {
  const contents = {
    format: "absensi-full-operational-backup",
    version: 1,
    createdAt: "2026-10-21T14:00:00.000Z",
    source: { host: "db.example.invalid", port: 5432, database: "absensi" },
    included: ["employee profiles", "attendance records"],
    excluded: ["biometric fingerprint template data", "WebAuthn credentials and public keys"],
    tables,
  };
  return {
    ...contents,
    sha256: createHash("sha256").update(JSON.stringify(contents)).digest("hex"),
  };
}

test("encrypted operational backup round-trips and hides table data", () => {
  const snapshot = createSnapshot({
    ...emptyTables,
    employees: [{ id: 7, name: "Backup Test Employee" }],
  });
  const key = randomBytes(32);
  const encrypted = encryptBackup(snapshot, key);
  assert.equal(encrypted.includes(Buffer.from("Backup Test Employee")), false);
  assert.deepEqual(decryptBackup(encrypted, key), snapshot);
});

test("encrypted operational backup rejects a different key", () => {
  const key = randomBytes(32);
  const snapshot = createSnapshot();
  const encrypted = encryptBackup(snapshot, key);
  assert.throws(() => decryptBackup(encrypted, randomBytes(32)));
});

test("encrypted operational backup rejects a modified envelope", () => {
  const key = randomBytes(32);
  const snapshot = createSnapshot();
  const envelope = JSON.parse(encryptBackup(snapshot, key).toString("utf8"));
  envelope.ciphertext = Buffer.from("altered").toString("base64");
  assert.throws(() => decryptBackup(Buffer.from(JSON.stringify(envelope)), key));
});

test("database connection requires verified TLS", () => {
  assert.throws(
    () => getDatabaseConfig("postgresql://backup:secret@db.example.invalid:5432/absensi"),
    /ssl=true/
  );

  const config = getDatabaseConfig(
    "postgresql://backup:secret@db.example.invalid:3306/absensi?ssl=true"
  );
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.equal(config.host, "db.example.invalid");
  assert.equal(config.database, "absensi");
});

test("restore refuses its own source database", () => {
  const snapshot = createSnapshot();
  assert.throws(
    () => assertRestoreTargetIsDifferent(snapshot, {
      host: "DB.EXAMPLE.invalid",
      port: 5432,
      database: "ABSENSI",
    }),
    /matches the backup source/
  );
  assert.doesNotThrow(() => assertRestoreTargetIsDifferent(snapshot, {
    host: "restore.example.invalid",
    port: 5432,
    database: "absensi",
  }));
});

test("backup refuses an empty database snapshot", () => {
  assert.throws(
    () => validateSnapshotForBackup(createSnapshot()),
    /Refusing to save an empty operational backup/
  );
});

test("backup refuses fingerprint mappings without a matching employee", () => {
  const snapshot = createSnapshot({
    ...emptyTables,
    fingerprint_mappings: [{
      id: 4,
      deviceId: "ESP32-01",
      templateId: 12,
      employeeId: 99,
      createdAt: "2026-10-21 00:00:00",
    }],
  });
  assert.throws(
    () => validateSnapshotForBackup(snapshot),
    /fingerprint template 12 references a missing employee/
  );
});

test("backup refuses a DATABASE_URL that is not the pinned database", () => {
  const config = getDatabaseConfig(
    "postgresql://backup:secret@db.example.invalid:15140/absensi?ssl=true"
  );
  const expected = {
    host: "db.example.invalid",
    port: 15140,
    database: "absensi",
  };
  assert.doesNotThrow(() => assertExpectedBackupTarget(config, expected));
  assert.throws(
    () => assertExpectedBackupTarget(config, { ...expected, database: "other" }),
    /does not match the pinned database/
  );
});
