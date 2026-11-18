import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { decideApproval } from "@/app/portal/approvals/actions";
import { prisma, makeTenant, makeCampus, makeStudent, makeUser, authContextFor, cleanupAll, uid } from "./helpers";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("approvals (maker-checker)", () => {
  let tenantId: string, campusId: string, studentId: string;
  let maker: { id: string }, checker: { id: string }, noRights: { id: string };
  let ctxOf: (u: { id: string }) => Promise<unknown>;

  beforeAll(async () => {
    tenantId = (await makeTenant("Approvals Org")).id;
    campusId = (await makeCampus(tenantId)).id;
    studentId = (await makeStudent({ tenantId, campusId, firstName: "Pay", lastName: "Back", admissionNumber: uid("A") })).id;
    maker = await makeUser({ tenantId, permissions: ["fee.adjust", "inventory.requisition.approve"], scope: "ORG" });
    checker = await makeUser({ tenantId, permissions: ["fee.adjust", "inventory.requisition.approve"], scope: "ORG" });
    noRights = await makeUser({ tenantId, permissions: ["fee.read"], scope: "ORG" });
    ctxOf = (u) => authContextFor(u.id);
  });
  afterAll(cleanupAll);

  const refundRequest = () =>
    prisma.approvalRequest.create({
      data: { tenantId, campusId, requestType: "fee.adjust", referenceType: "Student", referenceId: studentId, requestedByUserId: maker.id, payload: { studentId, amount: 5000, method: "BANK", reason: "Overpaid" } },
    });

  it("will not let the requester approve their own request", async () => {
    const r = await refundRequest();
    current = await ctxOf(maker);
    expect((await decideApproval({}, fd({ id: r.id, decision: "APPROVED" }))).error).toMatch(/own request/i);
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("PENDING");
    expect(await prisma.refund.count({ where: { studentId } })).toBe(0);
  });

  it("refuses an approver without the permission", async () => {
    const r = await refundRequest();
    current = await ctxOf(noRights);
    expect((await decideApproval({}, fd({ id: r.id, decision: "APPROVED" }))).error).toMatch(/not allowed/i);
  });

  it("approving executes the refund exactly once and records who approved", async () => {
    const r = await refundRequest();
    current = await ctxOf(checker);
    expect((await decideApproval({}, fd({ id: r.id, decision: "APPROVED" }))).ok).toBe(true);
    const refunds = await prisma.refund.findMany({ where: { studentId, reason: "Overpaid" } });
    expect(refunds.filter((x) => x.approvedByUserId === checker.id)).toHaveLength(1);
    expect(refunds[0].amount).toBe(5000);
    expect((await decideApproval({}, fd({ id: r.id, decision: "APPROVED" }))).error).toMatch(/already approved/i);
    expect(await prisma.refund.count({ where: { studentId, reason: "Overpaid", approvedByUserId: checker.id } })).toBe(1);
  });

  it("rejecting needs a reason and creates no refund", async () => {
    const r = await refundRequest();
    const before = await prisma.refund.count({ where: { studentId } });
    current = await ctxOf(checker);
    expect((await decideApproval({}, fd({ id: r.id, decision: "REJECTED" }))).error).toMatch(/reason/i);
    expect((await decideApproval({}, fd({ id: r.id, decision: "REJECTED", note: "Not due" }))).ok).toBe(true);
    expect(await prisma.refund.count({ where: { studentId } })).toBe(before);
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: r.id } })).decisionNote).toBe("Not due");
  });

  it("cannot decide another school's request", async () => {
    const r = await refundRequest();
    const otherTenant = (await makeTenant("Elsewhere")).id;
    const stranger = await makeUser({ tenantId: otherTenant, permissions: ["fee.adjust"], scope: "ORG" });
    current = await ctxOf(stranger);
    expect((await decideApproval({}, fd({ id: r.id, decision: "APPROVED" }))).error).toMatch(/not found/i);
  });
});
