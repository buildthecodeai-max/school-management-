import { PrismaClient } from "@prisma/client";

// Runs once before the integration suite and once after. Verifies the database
// is reachable (integration tests are meaningless without it — fail loud, don't
// skip) and sweeps any `itest_` fixtures left by a previously crashed run.
export async function setup() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      `Integration tests need a database at DATABASE_URL. ` +
        `Start it with \`npm run db:up\`. Original error: ${(err as Error).message}`,
    );
  }
  const stale = await prisma.tenant.findMany({
    where: { slug: { startsWith: "itest_" } },
    select: { id: true },
  });
  if (stale.length) {
    const ids = stale.map((t) => t.id);
    await prisma.auditEvent.deleteMany({ where: { chainKey: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.auditEvent.deleteMany({ where: { action: { startsWith: "itest_" } } });
  await prisma.$disconnect();
}

export async function teardown() {
  const prisma = new PrismaClient();
  const stale = await prisma.tenant.findMany({
    where: { slug: { startsWith: "itest_" } },
    select: { id: true },
  });
  if (stale.length) {
    const ids = stale.map((t) => t.id);
    await prisma.auditEvent.deleteMany({ where: { chainKey: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.auditEvent.deleteMany({ where: { action: { startsWith: "itest_" } } });
  await prisma.$disconnect();
}
