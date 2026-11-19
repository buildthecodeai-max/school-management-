import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";

let current: unknown;
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { GET } from "@/app/portal/fees/journal/route";
import { prisma, makeTenant, makeCampus, makeUser, makeStudent, authContextFor, cleanupAll, uid } from "./helpers";

describe("GL journal export", () => {
  let tenantId: string, campusA: string, campusB: string, ctxA: unknown, ctxAll: unknown;
  const get = (qs = "") => GET(new NextRequest(`http://localhost/portal/fees/journal${qs}`));

  beforeAll(async () => {
    tenantId = (await makeTenant("GL Org")).id;
    campusA = (await makeCampus(tenantId, "A")).id;
    campusB = (await makeCampus(tenantId, "B")).id;
    const head = await prisma.feeHead.create({ data: { tenantId, code: uid("T"), name: "Tuition", glAccountCode: "4000" } });
    for (const [campusId, name, issue, amount] of [[campusA, "A", "2026-03-10", 1234500], [campusB, "B", "2026-03-20", 99900]] as const) {
      const s = await makeStudent({ tenantId, campusId, firstName: name === "A" ? "=cmd" : "Bee", lastName: "Kid", admissionNumber: uid(name) });
      const inv = await prisma.invoice.create({ data: { tenantId, campusId, studentId: s.id, number: uid("INV"), periodLabel: "T1", issueDate: new Date(`${issue}T12:00:00`), dueDate: new Date("2026-06-01"), total: amount, balance: amount } });
      await prisma.invoiceLine.create({ data: { tenantId, invoiceId: inv.id, feeHeadId: head.id, description: "Tuition, term 1", amount } });
    }
    ctxA = await authContextFor((await makeUser({ tenantId, permissions: ["fee.read"], scope: "CAMPUS", campusId: campusA })).id);
    ctxAll = await authContextFor((await makeUser({ tenantId, permissions: ["fee.read"], scope: "ORG" })).id);
  });
  afterAll(cleanupAll);

  it("only exports the caller's campuses and refuses others", async () => {
    current = ctxA;
    const ok = await (await get()).text();
    expect(ok).toContain("12345.00");
    expect(ok).not.toContain("999.00");
    expect((await get(`?campusId=${campusB}`)).status).toBe(404);
  });

  it("writes commas and formulas safely, with plain decimal amounts", async () => {
    current = ctxAll;
    const csv = await (await get()).text();
    expect(csv).toContain('"Tuition, term 1"');
    expect(csv).toContain('"12345.00"');
    expect(csv).not.toMatch(/\$|1,234/);
    expect(csv).toContain("'=cmd"); // spreadsheet formula neutralised
  });

  it("applies both date bounds together and validates them", async () => {
    current = ctxAll;
    const only = await (await get("?from=2026-03-15&to=2026-03-31")).text();
    expect(only).toContain("999.00");
    expect(only).not.toContain("12345.00");
    expect((await get("?from=2026-04-01&to=2026-03-01")).status).toBe(400);
    expect((await get("?from=garbage")).status).toBe(400);
  });
});
