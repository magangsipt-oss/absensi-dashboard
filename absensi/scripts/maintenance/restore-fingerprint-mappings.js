const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');
const prisma = new PrismaClient();

const confirmation = '--confirm=RESTORE-FINGERPRINT-MAPPINGS';
const fromAudit = '--from-audit';

function loadBackup(filePath) {
  const backup = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  if (
    backup?.version !== 1 ||
    !Array.isArray(backup.mappings) ||
    !Array.isArray(backup.pendingRegistrations)
  ) {
    throw new Error('Format backup mapping tidak dikenal.');
  }

  for (const mapping of backup.mappings) {
    if (
      !Number.isInteger(mapping.templateId) ||
      mapping.templateId < 1 ||
      mapping.templateId > 127 ||
      (mapping.employeeId !== null && !Number.isInteger(mapping.employeeId)) ||
      typeof mapping.createdAt !== 'string'
    ) {
      throw new Error('Backup berisi mapping yang tidak valid; pemulihan dibatalkan.');
    }
  }

  return backup;
}

async function main() {
  const backupPath = process.argv[2];
  let backup;
  if (process.argv.includes(fromAudit)) {
    const auditEntries = await prisma.fingerprintMappingAudit.findMany({
      orderBy: [{ templateId: 'asc' }, { changedAt: 'desc' }, { id: 'desc' }],
    });
    const latestByTemplate = new Map();
    for (const entry of auditEntries) {
      if (!latestByTemplate.has(entry.templateId)) latestByTemplate.set(entry.templateId, entry);
    }
    backup = {
      version: 1,
      mappings: [...latestByTemplate.values()]
        .filter((entry) => !["DELETED", "EMPLOYEE_DELETED", "BULK_DELETED"].includes(entry.action))
        .map((entry) => ({
          templateId: entry.templateId,
          deviceId: entry.deviceId,
          employeeId: entry.employeeId,
          createdAt: entry.changedAt.toISOString(),
        })),
      pendingRegistrations: [],
    };
  } else {
    if (!backupPath) {
      throw new Error('Gunakan file backup, atau tambahkan --from-audit untuk mengambil kondisi mapping terakhir dari riwayat database.');
    }
    backup = loadBackup(backupPath);
  }

  if (!process.argv.includes(confirmation)) {
    console.log(`Mode pemeriksaan saja: ${backup.mappings.length} mapping dan ${backup.pendingRegistrations.length} pendaftaran tertunda ditemukan.`);
    console.log(`Untuk memulihkan, jalankan ulang dengan ${confirmation}`);
    return;
  }

  const backupMappingByTemplate = new Map();
  for (const mapping of backup.mappings) {
    const previous = backupMappingByTemplate.get(mapping.templateId);
    if (previous && previous.employeeId !== mapping.employeeId) {
      throw new Error(`Backup memiliki pegawai berbeda untuk template ${mapping.templateId}. Pemulihan dibatalkan.`);
    }
    backupMappingByTemplate.set(mapping.templateId, mapping);
  }
  backup.mappings = [...backupMappingByTemplate.values()];

  const employeeIds = [...new Set([
    ...backup.mappings.map((mapping) => mapping.employeeId).filter((id) => id !== null),
    ...backup.pendingRegistrations.map((employee) => employee.id),
  ])];
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true },
  });
  const existingEmployeeIds = new Set(employees.map((employee) => employee.id));
  const missingEmployeeIds = employeeIds.filter((id) => !existingEmployeeIds.has(id));
  if (missingEmployeeIds.length > 0) {
    throw new Error(`Pegawai ID ${missingEmployeeIds.join(', ')} tidak ditemukan. Tidak ada mapping yang dipulihkan.`);
  }

  const existingMappings = await prisma.fingerprintMapping.findMany({
    where: { templateId: { in: backup.mappings.map((mapping) => mapping.templateId) } },
    select: { templateId: true, employeeId: true },
  });
  const backupEmployeeByTemplate = new Map(backup.mappings.map((mapping) => [mapping.templateId, mapping.employeeId]));
  const conflicts = existingMappings.filter((mapping) =>
    mapping.employeeId !== null &&
    mapping.employeeId !== backupEmployeeByTemplate.get(mapping.templateId)
  );
  if (conflicts.length > 0) {
    throw new Error(`Mapping ID ${conflicts.map((mapping) => mapping.templateId).join(', ')} sudah terhubung ke pegawai lain. Tidak ada mapping yang dipulihkan.`);
  }

  const pendingRegistrations = backup.pendingRegistrations.filter((employee) => employee.pendingFingerprintId !== null);
  const pendingIds = pendingRegistrations.map((employee) => employee.pendingFingerprintId);
  if (pendingIds.some((id) => !Number.isInteger(id) || id < 1 || id > 127)) {
    throw new Error('Backup berisi ID pendaftaran tertunda yang tidak valid.');
  }
  if (pendingIds.length > 0) {
    const otherPendingOwners = await prisma.employee.findMany({
      where: {
        pendingFingerprintId: { in: pendingIds },
        id: { notIn: pendingRegistrations.map((employee) => employee.id) },
      },
      select: { id: true, pendingFingerprintId: true },
    });
    if (otherPendingOwners.length > 0) {
      throw new Error('Ada pendaftaran tertunda dengan ID yang sama pada pegawai lain. Tidak ada data yang dipulihkan.');
    }
  }

  await prisma.$transaction(async (transaction) => {
    for (const mapping of backup.mappings) {
      const previous = await transaction.fingerprintMapping.findUnique({
        where: { templateId: mapping.templateId },
      });
      await transaction.fingerprintMapping.upsert({
        where: { templateId: mapping.templateId },
        update: {
          deviceId: mapping.deviceId,
          employeeId: mapping.employeeId,
        },
        create: {
          templateId: mapping.templateId,
          deviceId: mapping.deviceId,
          employeeId: mapping.employeeId,
          templateData: null,
          createdAt: new Date(mapping.createdAt),
        },
      });
      if (!previous || previous.employeeId !== mapping.employeeId || previous.deviceId !== mapping.deviceId) {
        await transaction.fingerprintMappingAudit.create({
          data: {
            action: 'RESTORED',
            templateId: mapping.templateId,
            deviceId: mapping.deviceId,
            previousEmployeeId: previous?.employeeId,
            employeeId: mapping.employeeId,
          },
        });
      }
    }

    for (const employee of pendingRegistrations) {
      await transaction.employee.update({
        where: { id: employee.id },
        data: { pendingFingerprintId: employee.pendingFingerprintId },
      });
    }
  });

  console.log(`Berhasil memulihkan ${backup.mappings.length} mapping ${process.argv.includes(fromAudit) ? 'dari riwayat audit database' : `dari ${path.resolve(backupPath)}`}.`);
  console.log('Data template biometrik tidak termasuk backup; template di sensor ESP32 tidak diubah.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
