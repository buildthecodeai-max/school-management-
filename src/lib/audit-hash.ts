import { createHash } from "crypto";

// Pure hashing for the SEC-005 audit chain. Kept free of `server-only` and of
// any Prisma import so it can run under plain tsx (the backfill script) and
// under Vitest as well as inside Next.
//
// The canonical payload's shape and ordering are FROZEN — changing this
// function invalidates every existing chain.

export const PLATFORM_CHAIN = "__platform__";

export function canonicalAuditPayload(row: {
  chainKey: string;
  seq: number;
  tenantId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  scopeType: string;
  campusId: string | null;
  outcome: string;
  correlationId: string | null;
  createdAt: Date;
  metadata: unknown;
  prevHash: string | null;
}): string {
  return JSON.stringify([
    row.chainKey,
    row.seq,
    row.tenantId,
    row.actorUserId,
    row.action,
    row.targetType ?? null,
    row.targetId ?? null,
    row.scopeType,
    row.campusId,
    row.outcome,
    row.correlationId,
    row.createdAt.toISOString(),
    row.metadata === undefined ? null : row.metadata,
    row.prevHash,
  ]);
}

export function hashAuditPayload(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
