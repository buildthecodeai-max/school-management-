import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { saveHealthRecord, reportHealthIncident } from "@/app/portal/health/actions";
import { openSafeguardingCase, addSafeguardingNote, setSafeguardingStatus } from "@/app/portal/safeguarding/actions";
import { prisma, makeTenant, makeCampus, makeUser, makeStudent, authContextFor, cleanupAll, uid } from "./helpers";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("health records and safeguarding", () => {
  let tenantId: string, campusId: string, otherCampus: string;
  let studentId: string, admission: string, foreignStudent: string, foreignAdmission: string, foreignCase: string;
  let campusAdmin: unknown, nurse: unknown, nurseOther: unknown, dsl: unknown, dsl2: unknown, dsl2Id: string, dslId: string;

  beforeAll(async () => {
    tenantId = (await makeTenant("Care Org")).id;
    campusId = (await makeCampus(tenantId, "A")).id;
    otherCampus = (await makeCampus(tenantId, "B")).id;
    admission = uid("AD");
    studentId = (await makeStudent({ tenantId, campusId, firstName: "Sam", lastName: "Pupil", admissionNumber: admission })).id;
    const t2 = (await makeTenant("Other Care Org")).id;
    const c2 = (await makeCampus(t2, "X")).id;
    foreignAdmission = uid("AD");
    foreignStudent = (await makeStudent({ tenantId: t2, campusId: c2, firstName: "Far", lastName: "Away", admissionNumber: foreignAdmission })).id;
    foreignCase = (await prisma.safeguardingCase.create({ data: { tenantId: t2, campusId: c2, studentId: foreignStudent, title: "Theirs" } })).id;
    await prisma.safeguardingNote.create({ data: { tenantId: t2, caseId: foreignCase, authorUserId: (await makeUser({ tenantId: t2, permissions: [], scope: "ORG" })).id, body: "original" } });

    campusAdmin = await authContextFor((await makeUser({ tenantId, permissions: ["student.read", "attendance.read"], scope: "CAMPUS", campusId })).id);
    nurse = await authContextFor((await makeUser({ tenantId, permissions: ["health.record.read", "health.record.write", "health.incident.write"], scope: "CAMPUS", campusId })).id);
    nurseOther = await authContextFor((await makeUser({ tenantId, permissions: ["health.record.read", "health.record.write", "health.incident.write"], scope: "CAMPUS", campusId: otherCampus })).id);
    const d1 = await makeUser({ tenantId, permissions: ["safeguarding.case.read", "safeguarding.case.write"], scope: "CAMPUS", campusId });
    const d2 = await makeUser({ tenantId, permissions: ["safeguarding.case.read"], scope: "CAMPUS", campusId });
    dslId = d1.id; dsl2Id = d2.id;
    dsl = await authContextFor(d1.id); dsl2 = await authContextFor(d2.id);
  });
  afterAll(cleanupAll);

  describe("health", () => {
    const save = (o: Record<string, string> = {}) => saveHealthRecord({}, fd({ studentId, allergies: "Peanuts", conditions: "Asthma", ...o }));

    it("denies roles without health rights and other campuses", async () => {
      current = campusAdmin;
      expect((await save()).error).toMatch(/permission/i);
      current = nurseOther;
      expect((await save()).error).toMatch(/permission/i);
      expect(await prisma.healthRecord.count({ where: { tenantId } })).toBe(0);
    });

    it("cannot touch another school's student", async () => {
      current = nurse;
      expect((await saveHealthRecord({}, fd({ studentId: foreignStudent, allergies: "X" }))).error).toMatch(/student not found/i);
      expect(await prisma.healthRecord.count({ where: { studentId: foreignStudent } })).toBe(0);
    });

    it("creates and updates a record; the audit trail names fields, never medical content", async () => {
      current = nurse;
      expect((await save()).ok).toBe(true);
      expect((await save({ allergies: "Peanuts, latex" })).ok).toBe(true);
      const rec = await prisma.healthRecord.findFirstOrThrow({ where: { studentId } });
      expect(rec).toMatchObject({ campusId, allergies: "Peanuts, latex", conditions: "Asthma" });
      const events = await prisma.auditEvent.findMany({ where: { chainKey: tenantId, action: { startsWith: "health.record" } } });
      expect(events.map((e) => e.action).sort()).toEqual(["health.record.created", "health.record.updated"]);
      expect(JSON.stringify(events)).not.toMatch(/Peanuts|Asthma/);
    });

    it("validates incidents and refuses unknown or foreign records", async () => {
      current = nurse;
      const rec = await prisma.healthRecord.findFirstOrThrow({ where: { studentId } });
      const inc = (o: Record<string, string>) => reportHealthIncident({}, fd({ healthRecordId: rec.id, description: "Fell in the playground", occurredAt: new Date(Date.now() - 3600_000).toISOString(), ...o }));
      expect((await inc({ healthRecordId: "nope" })).error).toMatch(/not found/i);
      expect((await inc({ description: "x" })).error).toMatch(/describe/i);
      expect((await inc({ occurredAt: "garbage" })).error).toMatch(/when/i);
      expect((await inc({ occurredAt: new Date(Date.now() + 86_400_000).toISOString() })).error).toMatch(/future/i);
      current = nurseOther;
      expect((await inc({})).error).toMatch(/permission/i);
      current = nurse;
      expect((await inc({})).ok).toBe(true);
      expect(await prisma.healthIncident.count({ where: { healthRecordId: rec.id } })).toBe(1);
    });
  });

  describe("safeguarding", () => {
    let caseId: string;
    const open = (o: Record<string, string> = {}) => openSafeguardingCase({}, fd({ admissionNumber: admission, title: "Worrying bruises", concern: "Child reported an injury at home.", ...o }));

    it("requires write rights on the student's campus and a real student of this school", async () => {
      current = dsl2;
      expect((await open()).error).toMatch(/permission/i);
      current = dsl;
      expect((await open({ admissionNumber: foreignAdmission })).error).toMatch(/no student/i);
      expect((await open({ title: "x" })).error).toMatch(/title/i);
      expect((await open({ concern: "short" })).error).toMatch(/concern/i);
      expect(await prisma.safeguardingCase.count({ where: { tenantId } })).toBe(0);
    });

    it("opens a case with its first note and alerts other readers without naming the student", async () => {
      current = dsl;
      expect((await open()).ok).toBe(true);
      const c = await prisma.safeguardingCase.findFirstOrThrow({ where: { tenantId }, include: { notes: true } });
      caseId = c.id;
      expect(c.campusId).toBe(campusId);
      expect(c.notes).toHaveLength(1);
      const msgs = await prisma.message.findMany({ where: { tenantId, relatedId: caseId } });
      expect(msgs.map((m) => m.recipientUserId)).toEqual([dsl2Id]);
      expect(msgs[0].dataClassification).toBe("SENSITIVE");
      expect(`${msgs[0].title} ${msgs[0].body}`).not.toMatch(/Sam|Pupil|bruise/i);
      expect(msgs.some((m) => m.recipientUserId === dslId)).toBe(false);
    });

    it("cannot read or change another school's case", async () => {
      current = dsl;
      expect((await addSafeguardingNote({}, fd({ caseId: foreignCase, body: "injected note" }))).error).toMatch(/not found/i);
      expect((await setSafeguardingStatus({}, fd({ caseId: foreignCase, to: "CLOSED", reason: "closing someone else's case" }))).error).toMatch(/not found/i);
      const theirs = await prisma.safeguardingCase.findUniqueOrThrow({ where: { id: foreignCase }, include: { notes: true } });
      expect(theirs.status).toBe("OPEN");
      expect(theirs.notes).toHaveLength(1);
    });

    it("keeps an append-only record through status changes, demanding reasons", async () => {
      current = dsl2;
      expect((await addSafeguardingNote({}, fd({ caseId, body: "reader should not write" }))).error).toMatch(/denied/i);
      current = dsl;
      expect((await addSafeguardingNote({}, fd({ caseId, body: "Spoke with the class teacher." }))).ok).toBe(true);
      expect((await setSafeguardingStatus({}, fd({ caseId, to: "UNDER_REVIEW" }))).ok).toBe(true);
      expect((await setSafeguardingStatus({}, fd({ caseId, to: "UNDER_REVIEW" }))).error).toMatch(/cannot become/i);
      expect((await setSafeguardingStatus({}, fd({ caseId, to: "CLOSED" }))).error).toMatch(/reason/i);
      expect((await setSafeguardingStatus({}, fd({ caseId, to: "CLOSED", reason: "Referred to social services; family engaged." }))).ok).toBe(true);
      const closed = await prisma.safeguardingCase.findUniqueOrThrow({ where: { id: caseId } });
      expect(closed.status).toBe("CLOSED");
      expect(closed.closedAt).not.toBeNull();
      expect((await addSafeguardingNote({}, fd({ caseId, body: "late note" }))).error).toMatch(/closed/i);
      expect((await setSafeguardingStatus({}, fd({ caseId, to: "OPEN" }))).error).toMatch(/reason/i);
      expect((await setSafeguardingStatus({}, fd({ caseId, to: "OPEN", reason: "New information received from school." }))).ok).toBe(true);
      const notes = await prisma.safeguardingNote.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } });
      expect(notes).toHaveLength(5); // concern, note, 3 status changes
      expect(notes.at(-1)!.body).toMatch(/CLOSED to OPEN.*New information/);
      const actions = (await prisma.auditEvent.findMany({ where: { chainKey: tenantId, action: { startsWith: "safeguarding." } } })).map((e) => e.action);
      expect(actions).toEqual(expect.arrayContaining(["safeguarding.case.opened", "safeguarding.note.added", "safeguarding.case.closed", "safeguarding.case.reopened"]));
    });
  });
});
