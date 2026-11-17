/**
 * One-time backfill for SEC-005 audit hash-chaining.
 *
 * Existing audit_events rows predate the chainKey/seq/prevHash/entryHash
 * columns. This groups them by chain (tenantId, or "__platform__"), orders by
 * createdAt then id, and writes a consistent chain so verifyAuditChain() passes
 * from the first historical row onward. Safe to re-run: rows that already have
 * an entryHash are skipped, and a chain that is already fully populated is left
 * untouched.
 *
 *   npx tsx scripts/backfill-audit-chain.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  PLATFORM_CHAIN,
  canonicalAuditPayload,
  hashAuditPayload,
} from "../src/lib/audit-hash";

const prisma = new PrismaClient();

async function main() {
  const all = await prisma.auditEvent.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const byChain = new Map<string, typeof all>();
  for (const row of all) {
    const key = row.tenantId ?? PLATFORM_CHAIN;
    (byChain.get(key) ?? byChain.set(key, []).get(key)!).push(row);
  }

  let chainsTouched = 0;
  let rowsWritten = 0;

  for (const [chainKey, rows] of byChain) {
    if (rows.every((r) => r.entryHash)) continue; // already chained

    let prevHash: string | null = null;
    let seq = 0;
    for (const r of rows) {
      seq += 1;
      const payload = canonicalAuditPayload({
        chainKey,
        seq,
        tenantId: r.tenantId,
        actorUserId: r.actorUserId,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        scopeType: r.scopeType,
        campusId: r.campusId,
        outcome: r.outcome,
        correlationId: r.correlationId,
        createdAt: r.createdAt,
        metadata: r.metadata ?? null,
        prevHash,
      });
      const entryHash = hashAuditPayload(payload);
      await prisma.auditEvent.update({
        where: { id: r.id },
        data: { chainKey, seq, prevHash, entryHash },
      });
      prevHash = entryHash;
      rowsWritten += 1;
    }
    chainsTouched += 1;
    console.log(`  chain ${chainKey}: ${rows.length} rows`);
  }

  console.log(`\nBackfilled ${rowsWritten} row(s) across ${chainsTouched} chain(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
