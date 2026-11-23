import { prisma } from "./attendance-store";

type DatabaseHealthRow = {
  databaseName: string | null;
  employeeCount: bigint;
  mappingCount: bigint;
  attendanceCount: bigint;
};

export async function assertProductionDatabaseTarget() {
  if (process.env.NODE_ENV !== "production") return;

  const databaseUrl = process.env.DATABASE_URL;
  const expectedHost = process.env.EXPECTED_DATABASE_HOST?.trim().toLowerCase();
  const expectedName = process.env.EXPECTED_DATABASE_NAME?.trim();
  const expectedPort = Number(process.env.EXPECTED_DATABASE_PORT);
  if (
    !databaseUrl ||
    !expectedHost ||
    !expectedName ||
    !Number.isInteger(expectedPort) ||
    expectedPort < 1
  ) {
    throw new Error(
      "Database safety is not configured. Set EXPECTED_DATABASE_HOST, EXPECTED_DATABASE_PORT, and EXPECTED_DATABASE_NAME."
    );
  }

  const configuredUrl = new URL(databaseUrl);
  const configuredName = decodeURIComponent(configuredUrl.pathname.slice(1));
  if (
    configuredUrl.hostname.toLowerCase() !== expectedHost ||
    Number(configuredUrl.port || 5432) !== expectedPort ||
    configuredName.toLowerCase() !== expectedName.toLowerCase()
  ) {
    throw new Error("DATABASE_URL does not match the pinned production database target.");
  }

  const [identity] = await prisma.$queryRaw<DatabaseHealthRow[]>`
    SELECT
      current_database() AS "databaseName",
      (SELECT COUNT(*) FROM employees) AS employeeCount,
      (SELECT COUNT(*) FROM fingerprint_mappings) AS mappingCount,
      (SELECT COUNT(*) FROM attendance_records) AS attendanceCount
  `;
  if (identity?.databaseName?.toLowerCase() !== expectedName.toLowerCase()) {
    throw new Error("Connected database name does not match EXPECTED_DATABASE_NAME.");
  }

  if (
    Number(identity.employeeCount) === 0 &&
    Number(identity.mappingCount) === 0 &&
    Number(identity.attendanceCount) === 0 &&
    process.env.ALLOW_EMPTY_DATABASE_INITIALIZATION !== "true"
  ) {
    throw new Error(
      "Production database returned no employees, mappings, or attendance. Verify the database target and recovery status before continuing."
    );
  }
}
