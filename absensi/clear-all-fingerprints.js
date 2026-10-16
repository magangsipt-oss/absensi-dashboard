const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const before = await prisma.fingerprintMapping.count();
  const deleted = await prisma.fingerprintMapping.deleteMany({});
  const cleared = await prisma.employee.updateMany({
    data: { pendingFingerprintId: null },
  });

  let serialResult = { ok: false, error: 'not-called' };
  try {
    const res = await fetch('http://localhost:3000/api/serial-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteAllFingerprints' }),
    });
    serialResult = await res.json();
  } catch (error) {
    serialResult = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const after = await prisma.fingerprintMapping.count();

  console.log(JSON.stringify({
    before,
    deletedMappings: deleted.count,
    clearedPending: cleared.count,
    after,
    serialResult,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
