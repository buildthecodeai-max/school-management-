import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { registerStudentDocument, removeStudentDocument } from "@/app/portal/students/actions";
import { prisma, makeTenant, makeCampus, makeStudent, makeUser, authContextFor, cleanupAll, uid } from "./helpers";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("student documents", () => {
  let tenantId: string, campusId: string, studentId: string, foreignStudentId: string;
  let writer: unknown, readOnly: unknown, otherCampusWriter: unknown, outsider: unknown;

  beforeAll(async () => {
    tenantId = (await makeTenant("Docs Org")).id;
    campusId = (await makeCampus(tenantId, "A")).id;
    const other = (await makeCampus(tenantId, "B")).id;
    studentId = (await makeStudent({ tenantId, campusId, firstName: "Doc", lastName: "Kid", admissionNumber: uid("D") })).id;
    writer = await authContextFor((await makeUser({ tenantId, permissions: ["student.write"], scope: "CAMPUS", campusId })).id);
    readOnly = await authContextFor((await makeUser({ tenantId, permissions: ["student.read"], scope: "ORG" })).id);
    otherCampusWriter = await authContextFor((await makeUser({ tenantId, permissions: ["student.write"], scope: "CAMPUS", campusId: other })).id);
    const t2 = (await makeTenant("Elsewhere")).id;
    const c2 = (await makeCampus(t2)).id;
    foreignStudentId = (await makeStudent({ tenantId: t2, campusId: c2, firstName: "Far", lastName: "Away", admissionNumber: uid("F") })).id;
    outsider = await authContextFor((await makeUser({ tenantId: t2, permissions: ["student.write"], scope: "ORG" })).id);
  });
  afterAll(cleanupAll);

  const reg = (o: Record<string, string>) => registerStudentDocument({}, fd({ studentId, docType: "PASSPORT", ...o }));

  it("needs student.write on the student's own campus", async () => {
    current = readOnly;
    expect((await reg({})).error).toMatch(/permission/i);
    current = otherCampusWriter;
    expect((await reg({})).error).toMatch(/permission/i);
    expect(await prisma.studentDocument.count({ where: { tenantId } })).toBe(0);
  });

  it("cannot attach a document to a student of another school", async () => {
    current = writer;
    expect((await registerStudentDocument({}, fd({ studentId: foreignStudentId, docType: "PASSPORT" }))).error).toMatch(/not found/i);
    current = outsider;
    expect((await reg({})).error).toMatch(/not found/i);
    expect(await prisma.studentDocument.count({ where: { studentId: foreignStudentId } })).toBe(0);
  });

  it("validates type, dates and link scheme", async () => {
    current = writer;
    expect((await reg({ docType: "NOPE" })).error).toMatch(/type/i);
    expect((await reg({ issuedAt: "2026-05-01", expiresAt: "2026-04-01" })).error).toMatch(/after the issue/i);
    expect((await reg({ fileUrl: "javascript:alert(1)" })).error).toMatch(/http/i);
  });

  it("registers with the campus taken from the enrollment, flags expired ones, and audits", async () => {
    current = writer;
    expect((await reg({ reference: "P123", expiresAt: "2020-01-01", fileUrl: "https://example.org/p.pdf" })).ok).toBe(true);
    const doc = await prisma.studentDocument.findFirstOrThrow({ where: { studentId } });
    expect(doc).toMatchObject({ campusId, reference: "P123", status: "EXPIRED", fileUrl: "https://example.org/p.pdf" });
    expect(await prisma.auditEvent.count({ where: { chainKey: tenantId, action: "student.document.registered" } })).toBe(1);
  });

  it("removal is permissioned and audited", async () => {
    const doc = await prisma.studentDocument.findFirstOrThrow({ where: { studentId } });
    current = readOnly;
    expect((await removeStudentDocument({}, fd({ id: doc.id }))).error).toMatch(/permission/i);
    current = writer;
    expect((await removeStudentDocument({}, fd({ id: doc.id }))).ok).toBe(true);
    expect(await prisma.studentDocument.count({ where: { studentId } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { chainKey: tenantId, action: "student.document.removed" } })).toBe(1);
  });
});
