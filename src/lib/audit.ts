import "server-only";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { ScopeType } from "@prisma/client";
import {
  PLATFORM_CHAIN,
  canonicalAuditPayload,
  hashAuditPayload,
} from "./audit-hash";

export { PLATFORM_CHAIN, canonicalAuditPayload, hashAuditPayload };

// Append-only, hash-chained audit writer (SEC-005 / §14.1).
//
// Each event is linked to the previous event in its chain:
//   entryHash = sha256( canonicalPayload || prevHash )
// where the chain is keyed by tenant (or "__platform__" for tenant-less
// platform events). Tampering with, reordering, or deleting any row breaks the
// chain from that point on, which verifyAuditChain() detects.
//
// The append runs in a Serializable transaction so two concurrent writes to the
// same chain cannot both read the same tail; the loser retries.

type AuditInput = {
  tenantId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  scopeType?: ScopeType;
  campusId?: string | null;
  outcome?: "SUCCESS" | "FAILURE" | "DENIED";
  correlationId?: string;
  metadata?: Record<string, unknown>;
};

export async function audit(input: AuditInput): Promise<void> {
  const chainKey = input.tenantId ?? PLATFORM_CHAIN;
  const createdAt = new Date();
  const correlationId = input.correlationId ?? randomUUID();
  const metadata = input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const tail = await tx.auditEvent.findFirst({
            where: { chainKey },
            orderBy: { seq: "desc" },
            select: { seq: true, entryHash: true },
          });
          const seq = (tail?.seq ?? 0) + 1;
          const prevHash = tail?.entryHash ?? null;

          const payload = canonicalAuditPayload({
            chainKey,
            seq,
            tenantId: input.tenantId ?? null,
            actorUserId: input.actorUserId ?? null,
            action: input.action,
            targetType: input.targetType ?? null,
            targetId: input.targetId ?? null,
            scopeType: input.scopeType ?? "ORG",
            campusId: input.campusId ?? null,
            outcome: input.outcome ?? "SUCCESS",
            correlationId,
            createdAt,
            metadata: input.metadata ?? null,
            prevHash,
          });

          await tx.auditEvent.create({
            data: {
              tenantId: input.tenantId ?? null,
              actorUserId: input.actorUserId ?? null,
              action: input.action,
              targetType: input.targetType,
              targetId: input.targetId,
              scopeType: input.scopeType ?? "ORG",
              campusId: input.campusId ?? null,
              outcome: input.outcome ?? "SUCCESS",
              correlationId,
              createdAt,
              metadata,
              chainKey,
              seq,
              prevHash,
              entryHash: hashAuditPayload(payload),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return;
    } catch (err) {
      const code = (err as { code?: string }).code;
      // 40001 serialization failure / P2034 write conflict — retry the append.
      // P2002 unique(chainKey,seq) — another writer took our seq, retry.
      if (code === "P2034" || code === "P2002" || code === "40001") continue;
      // Auditing must never break the primary operation.
      console.error("audit write failed", err);
      return;
    }
  }
  console.error("audit write failed after retries", { action: input.action, chainKey });
}

export interface ChainVerification {
  chainKey: string;
  ok: boolean;
  length: number;
  brokenAtSeq: number | null;
  reason: string | null;
}

// Walks a chain in seq order and recomputes every hash. Returns the first seq
// where the stored hash, prevHash link, or sequence numbering diverges.
export async function verifyAuditChain(chainKey: string): Promise<ChainVerification> {
  const rows = await prisma.auditEvent.findMany({
    where: { chainKey },
    orderBy: { seq: "asc" },
  });

  let prevHash: string | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const expectedSeq = i + 1;
    if (r.seq !== expectedSeq) {
      return { chainKey, ok: false, length: rows.length, brokenAtSeq: r.seq, reason: `gap or reorder: expected seq ${expectedSeq}, found ${r.seq}` };
    }
    if (r.prevHash !== prevHash) {
      return { chainKey, ok: false, length: rows.length, brokenAtSeq: r.seq, reason: "prevHash does not match preceding entryHash" };
    }
    if (!r.entryHash || !r.chainKey || r.seq === null) {
      return { chainKey, ok: false, length: rows.length, brokenAtSeq: r.seq, reason: "unchained row (missing chainKey/seq/entryHash)" };
    }
    const recomputed = hashAuditPayload(
      canonicalAuditPayload({
        chainKey: r.chainKey,
        seq: r.seq,
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
      return { chainKey, ok: false, length: rows.length, brokenAtSeq: r.seq, reason: "entryHash does not match recomputed hash (row content altered)" };
    }
    prevHash = r.entryHash;
  }

  return { chainKey, ok: true, length: rows.length, brokenAtSeq: null, reason: null };
}

export async function listAuditChains(): Promise<string[]> {
  const rows = await prisma.auditEvent.findMany({
    where: { chainKey: { not: null } },
    distinct: ["chainKey"],
    select: { chainKey: true },
  });
  return rows.map((r) => r.chainKey!).sort();
}
