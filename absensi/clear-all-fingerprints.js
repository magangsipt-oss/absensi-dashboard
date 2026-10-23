const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');
const prisma = new PrismaClient();

const confirmation = '--confirm=DELETE-ALL-FINGERPRINTS';
const backupsDirectory = path.join(__dirname, 'backups');

async function main() {
  const mappings = await prisma.fingerprintMapping.findMany({
    orderBy: { templateId: 'asc' },
    select: {
      templateId: true,
      deviceId: true,
      employeeId: true,
      createdAt: true,
    },
  });
  const pendingRegistrations = await prisma.employee.findMany({
    where: { pendingFingerprintId: { not: null } },
    select: { id: true, pendingFingerprintId: true },
  });
  const snapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    mappings: mappings.map((mapping) => ({
      ...mapping,
      createdAt: mapping.createdAt.toISOString(),
    })),
    pendingRegistrations,
  };

  fs.mkdirSync(backupsDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDirectory, `fingerprint-mappings-${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(snapshot, null, 2), { flag: 'wx' });

  const verifiedSnapshot = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  if (verifiedSnapshot.mappings.length !== mappings.length) {
    throw new Error(`Verifikasi backup gagal. Data database tidak diubah. File backup: ${backupPath}`);
  }

  console.log(`Backup mapping tersimpan dan terverifikasi: ${backupPath}`);
  console.log(`Jumlah mapping: ${mappings.length}; pendaftaran tertunda: ${pendingRegistrations.length}`);

  if (!process.argv.includes(confirmation)) {
    console.log(`Mode aman: tidak ada data yang dihapus. Untuk melanjutkan, jalankan ulang dengan ${confirmation}`);
    return;
  }

  const response = await fetch('http://localhost:3000/api/serial-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'deleteAllFingerprints' }),
  });
  const serialResult = await response.json().catch(() => null);
  if (!response.ok || serialResult?.success !== true) {
    throw new Error(`Penghapusan mapping dibatalkan karena penghapusan sensor tidak berhasil: ${serialResult?.error || `HTTP ${response.status}`}. Backup: ${backupPath}`);
  }

  await prisma.$transaction(async (transaction) => {
    for (const mapping of mappings) {
      await transaction.fingerprintMappingAudit.create({
        data: {
          action: 'BULK_DELETED',
          templateId: mapping.templateId,
          deviceId: mapping.deviceId,
          previousEmployeeId: mapping.employeeId,
          employeeId: mapping.employeeId,
        },
      });
    }
    await transaction.fingerprintMapping.deleteMany({});
    await transaction.employee.updateMany({ data: { pendingFingerprintId: null } });
  });

  const remainingMappings = await prisma.fingerprintMapping.count();
  const remainingPending = await prisma.employee.count({ where: { pendingFingerprintId: { not: null } } });
  if (remainingMappings !== 0 || remainingPending !== 0) {
    throw new Error(`Verifikasi penghapusan gagal (mapping tersisa ${remainingMappings}, pendaftaran tertunda ${remainingPending}). Backup: ${backupPath}`);
  }

  console.log(JSON.stringify({
    deletedMappings: mappings.length,
    clearedPending: pendingRegistrations.length,
    remainingMappings,
    remainingPending,
    backupPath,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
