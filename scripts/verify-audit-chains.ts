/**
 * SEC-005 operational check: verify every audit hash chain and print a summary.
 * Exit code 1 if any chain is broken. Run from cron or an ops runbook.
 *
 *   npx tsx scripts/verify-audit-chains.ts
 */
import { PrismaClient } from "@prisma/client";
import { canonicalAuditPayload, hashAuditPayload } from "../src/lib/audit-hash";

const prisma = new PrismaClient();

async function main() {
  const chains = await prisma.auditEvent.findMany({
    where: { chainKey: { not: null } },
    distinct: ["chainKey"],
    select: { chainKey: true },
  });

  let broken = 0;
  for (const { chainKey } of chains) {
    const rows = await prisma.auditEvent.findMany({
      where: { chainKey },
      orderBy: { seq: "asc" },
    });
    let prevHash: string | null = null;
    let ok = true;
    let detail = "";
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.seq !== i + 1) {
        ok = false;
        detail = `seq gap at ${r.seq} (expected ${i + 1})`;
        break;
      }
      if (r.prevHash !== prevHash) {
        ok = false;
        detail = `prevHash mismatch at seq ${r.seq}`;
        break;
      }
      const recomputed = hashAuditPayload(
        canonicalAuditPayload({
          chainKey: r.chainKey!,
          seq: r.seq!,
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
          prevHash: r.prevHash,
        }),
      );
      if (recomputed !== r.entryHash) {
        ok = false;
        detail = `content altered at seq ${r.seq}`;
        break;
      }
      prevHash = r.entryHash;
    }
    if (ok) {
      console.log(`OK    ${chainKey}  (${rows.length} events)`);
    } else {
      broken += 1;
      console.log(`BROKEN ${chainKey}  ${detail}`);
    }
  }

  console.log(`\n${chains.length} chain(s), ${broken} broken.`);
  process.exitCode = broken > 0 ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
