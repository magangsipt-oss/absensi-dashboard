import { createHash } from "node:crypto";
import { prisma } from "./attendance-store";

const WITA_OFFSET_HOURS = 8;
const csvHeader = ["id", "employeeId", "name", "time", "status", "note", "checkedAt", "createdAt"];

export interface RetentionResult {
  dryRun: boolean;
  cutoff: string;
  months: Array<{ month: string; rows: number }>;
  archivedRows: number;
  deletedRows: number;
}

// Keep the current and the previous calendar month (WITA); everything before that is archived.
export function getRetentionCutoff(now: Date) {
  const wita = new Date(now.getTime() + WITA_OFFSET_HOURS * 60 * 60 * 1000);
  return new Date(Date.UTC(wita.getUTCFullYear(), wita.getUTCMonth() - 1, 1, -WITA_OFFSET_HOURS));
}

export function witaMonthKey(date: Date) {
  return new Date(date.getTime() + WITA_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 7);
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildAttendanceCsv(
  rows: Array<{
    id: number;
    employeeId: number | null;
    name: string;
    time: string;
    status: string;
    note: string;
    checkedAt: Date;
    createdAt: Date;
  }>
) {
  const lines = [csvHeader.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.employeeId,
        row.name,
        row.time,
        row.status,
        row.note,
        row.checkedAt.toISOString(),
        row.createdAt.toISOString(),
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\r\n");
}

export async function runAttendanceRetention(options: { now?: Date; dryRun?: boolean } = {}): Promise<RetentionResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const cutoff = getRetentionCutoff(now);

  const oldRecords = await prisma.attendanceRecord.findMany({
    where: { checkedAt: { lt: cutoff } },
    orderBy: [{ checkedAt: "asc" }, { id: "asc" }],
  });

  const byMonth = new Map<string, typeof oldRecords>();
  for (const record of oldRecords) {
    const key = witaMonthKey(record.checkedAt);
    const group = byMonth.get(key);
    if (group) group.push(record);
    else byMonth.set(key, [record]);
  }

  const result: RetentionResult = {
    dryRun,
    cutoff: cutoff.toISOString(),
    months: [...byMonth.entries()].map(([month, rows]) => ({ month, rows: rows.length })),
    archivedRows: 0,
    deletedRows: 0,
  };
  if (dryRun) return result;

  for (const [month, rows] of byMonth) {
    const content = buildAttendanceCsv(rows);
    const ids = rows.map((row) => row.id);
    await prisma.$transaction(
      async (transaction) => {
        await transaction.attendanceArchive.create({
          data: {
            month,
            rowCount: rows.length,
            content,
            sha256: createHash("sha256").update(content).digest("hex"),
          },
        });
        const deleted = await transaction.attendanceRecord.deleteMany({ where: { id: { in: ids } } });
        // Abort (and roll back the archive) if the number of deleted rows differs from what was archived.
        if (deleted.count !== rows.length) {
          throw new Error(`Retention aborted for ${month}: archived ${rows.length} rows but deleted ${deleted.count}.`);
        }
      },
      { timeout: 30000 }
    );
    result.archivedRows += rows.length;
    result.deletedRows += rows.length;
  }

  return result;
}
