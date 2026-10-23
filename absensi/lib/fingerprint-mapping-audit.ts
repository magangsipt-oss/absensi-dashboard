import type { Prisma } from "@prisma/client";

export interface FingerprintMappingAuditEntry {
  action: string;
  templateId: number;
  deviceId?: string | null;
  previousEmployeeId?: number | null;
  employeeId?: number | null;
}

export function writeFingerprintMappingAudit(
  transaction: Prisma.TransactionClient,
  entry: FingerprintMappingAuditEntry
) {
  return transaction.fingerprintMappingAudit.create({
    data: {
      action: entry.action,
      templateId: entry.templateId,
      deviceId: entry.deviceId ?? null,
      previousEmployeeId: entry.previousEmployeeId ?? null,
      employeeId: entry.employeeId ?? null,
    },
  });
}
