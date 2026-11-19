import "server-only";
import { prisma } from "./db";

/** Student documents expiring within N days, for the daily cron (called with a tenant the cron already holds). */
export async function getExpiringDocuments(tenantId: string, withinDays = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  return prisma.studentDocument.findMany({
    where: { tenantId, expiresAt: { lte: cutoff, gte: new Date() } },
    include: { student: { include: { person: true } } },
    orderBy: { expiresAt: "asc" },
  });
}
