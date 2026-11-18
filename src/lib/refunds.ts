import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

// Money a family has paid that is not applied to any invoice and has not been
// returned: confirmed payments − allocations − refunds. Only this can be
// refunded; paid-and-allocated money needs a payment reversal instead.
export async function refundableCredit(db: Db, tenantId: string, studentId: string): Promise<number> {
  const [paid, allocated, refunded] = await Promise.all([
    db.payment.aggregate({ where: { tenantId, studentId, status: "CONFIRMED" }, _sum: { amount: true } }),
    db.allocation.aggregate({ where: { tenantId, payment: { studentId, status: "CONFIRMED" } }, _sum: { amount: true } }),
    db.refund.aggregate({ where: { tenantId, studentId }, _sum: { amount: true } }),
  ]);
  return Math.max(0, (paid._sum.amount ?? 0) - (allocated._sum.amount ?? 0) - (refunded._sum.amount ?? 0));
}
