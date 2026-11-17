import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { audit, verifyAuditChain } from "@/lib/audit";
import { prisma, makeTenant, uid, TEST_PREFIX, cleanupAll } from "./helpers";

// SEC-005 / P0-5 — the audit trail is hash-chained and tamper-evident.

describe("audit hash chain (SEC-005)", () => {
  let tenantId: string;
  const action = `${TEST_PREFIX}${uid("act")}`;

  beforeAll(async () => {
    tenantId = (await makeTenant("Audit Org")).id;
    // Write a short chain for this tenant.
    for (let i = 0; i < 5; i++) {
      await audit({
        tenantId,
        action,
        targetType: "Thing",
        targetId: `t${i}`,
        outcome: "SUCCESS",
        metadata: { i },
      });
    }
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it("writes a contiguous, verifiable chain", async () => {
    const rows = await prisma.auditEvent.findMany({
      where: { chainKey: tenantId },
      orderBy: { seq: "asc" },
    });
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(rows[0].prevHash).toBeNull();
    expect(rows[1].prevHash).toBe(rows[0].entryHash);

    const v = await verifyAuditChain(tenantId);
    expect(v.ok).toBe(true);
    expect(v.length).toBe(5);
  });

  it("detects a mutated row", async () => {
    const target = await prisma.auditEvent.findFirstOrThrow({
      where: { chainKey: tenantId, seq: 3 },
    });
    await prisma.auditEvent.update({
      where: { id: target.id },
      data: { outcome: "DENIED" }, // content change, hash not updated
    });

    const v = await verifyAuditChain(tenantId);
    expect(v.ok).toBe(false);
    expect(v.brokenAtSeq).toBe(3);

    // restore so the deletion test below sees a clean break point
    await prisma.auditEvent.update({
      where: { id: target.id },
      data: { outcome: "SUCCESS" },
    });
    expect((await verifyAuditChain(tenantId)).ok).toBe(true);
  });

  it("detects a deleted row (sequence gap)", async () => {
    await prisma.auditEvent.deleteMany({ where: { chainKey: tenantId, seq: 4 } });
    const v = await verifyAuditChain(tenantId);
    expect(v.ok).toBe(false);
    // seq 5 is now the 4th row -> expected seq 4, found 5
    expect(v.brokenAtSeq).toBe(5);
  });

  it("keeps separate chains per tenant", async () => {
    const other = await makeTenant("Audit Org 2");
    await audit({ tenantId: other.id, action, outcome: "SUCCESS" });
    const v = await verifyAuditChain(other.id);
    expect(v.ok).toBe(true);
    expect(v.length).toBe(1);
  });
});
