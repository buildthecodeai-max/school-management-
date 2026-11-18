import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { cancelLeaveRequest, submitLeaveRequest } from "@/app/portal/hr/leave-actions";
import { approveLeaveHr } from "@/app/portal/hr/actions";
import { prisma, makeTenant, makeCampus, makeUser, authContextFor, cleanupAll, uid } from "./helpers";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("staff leave requests", () => {
  let tenantId: string, campusId: string, otherCampus: string, annualId: string, studentOnlyId: string;
  let teacher: unknown, otherTeacher: unknown, approver: unknown, noProfile: unknown;

  const staffUser = async (campus: string, first: string) => {
    const person = await prisma.person.create({ data: { tenantId, firstName: first, lastName: "Staff" } });
    const staff = await prisma.staff.create({ data: { tenantId, personId: person.id, employeeNumber: uid("E") } });
    const dept = await prisma.department.create({ data: { tenantId, campusId: campus, name: uid("D") } });
    const pos = await prisma.position.create({ data: { tenantId, departmentId: dept.id, title: "Teacher" } });
    await prisma.employmentRecord.create({ data: { tenantId, campusId: campus, staffId: staff.id, positionId: pos.id, startDate: new Date("2026-01-01") } });
    const user = await makeUser({ tenantId, permissions: ["attendance.leave.request"], scope: "CAMPUS", campusId: campus });
    await prisma.user.update({ where: { id: user.id }, data: { personId: person.id } });
    return { ctx: await authContextFor(user.id), personId: person.id };
  };

  beforeAll(async () => {
    tenantId = (await makeTenant("Leave Org")).id;
    campusId = (await makeCampus(tenantId, "A")).id;
    otherCampus = (await makeCampus(tenantId, "B")).id;
    annualId = (await prisma.leaveType.create({ data: { tenantId, name: "Annual", daysPerYear: 3, appliesTo: "STAFF" } })).id;
    studentOnlyId = (await prisma.leaveType.create({ data: { tenantId, name: "Student only", daysPerYear: 5, appliesTo: "STUDENT" } })).id;
    teacher = (await staffUser(campusId, "Tina")).ctx;
    otherTeacher = (await staffUser(campusId, "Omar")).ctx;
    approver = await authContextFor((await makeUser({ tenantId, permissions: ["hr.leave.approve"], scope: "ORG" })).id);
    noProfile = await authContextFor((await makeUser({ tenantId, permissions: ["attendance.leave.request"], scope: "ORG" })).id);
  });
  afterAll(cleanupAll);

  const ask = (o: Record<string, string>) => submitLeaveRequest({}, fd({ leaveTypeId: annualId, campusId, startDate: "2026-04-06", endDate: "2026-04-07", days: "2", ...o }));

  it("refuses users without a staff profile and campuses they do not work at", async () => {
    current = noProfile;
    expect((await ask({})).error).toMatch(/no staff profile/i);
    current = teacher;
    expect((await ask({ campusId: otherCampus })).error).toMatch(/cannot request leave/i);
  });

  it("validates type, dates and days", async () => {
    current = teacher;
    expect((await ask({ leaveTypeId: studentOnlyId })).error).toMatch(/choose a leave type/i);
    expect((await ask({ startDate: "2026-04-09", endDate: "2026-04-08" })).error).toMatch(/cannot be before/i);
    expect((await ask({ days: "3" })).error).toMatch(/more than 2/i);
    expect((await ask({ days: "1.2" })).error).toMatch(/half/i);
    expect(await prisma.leaveRequest.count({ where: { tenantId } })).toBe(0);
  });

  it("creates a pending request and the balance row on first use", async () => {
    current = teacher;
    expect((await ask({ reason: "Family event" })).ok).toBe(true);
    const req = await prisma.leaveRequest.findFirstOrThrow({ where: { tenantId } });
    expect(req).toMatchObject({ status: "PENDING", days: 2, reason: "Family event" });
    const bal = await prisma.leaveBalance.findFirstOrThrow({ where: { tenantId, personId: req.personId, leaveTypeId: annualId } });
    expect(bal).toMatchObject({ totalDays: 3, usedDays: 0 });
  });

  it("rejects overlapping dates and requests beyond the remaining entitlement (pending counts)", async () => {
    current = teacher;
    expect((await ask({ startDate: "2026-04-07", endDate: "2026-04-08", days: "1" })).error).toMatch(/overlaps/i);
    expect((await ask({ startDate: "2026-05-04", endDate: "2026-05-05", days: "2" })).error).toMatch(/1 day\(s\) of Annual left/i);
    expect((await ask({ startDate: "2026-05-04", endDate: "2026-05-04", days: "1" })).ok).toBe(true);
  });

  it("another staff member can neither see nor cancel it", async () => {
    const req = await prisma.leaveRequest.findFirstOrThrow({ where: { tenantId, days: 2 } });
    current = otherTeacher;
    expect((await cancelLeaveRequest({}, fd({ id: req.id }))).error).toMatch(/not found/i);
  });

  it("approval uses the balance up; cancelling a pending request frees the entitlement", async () => {
    const req = await prisma.leaveRequest.findFirstOrThrow({ where: { tenantId, days: 2 } });
    current = approver;
    expect((await approveLeaveHr({}, fd({ leaveRequestId: req.id, decision: "APPROVED", campusId }))).ok).toBe(true);
    const bal = await prisma.leaveBalance.findFirstOrThrow({ where: { tenantId, personId: req.personId, leaveTypeId: annualId } });
    expect(bal.usedDays).toBe(2);

    current = teacher;
    expect((await cancelLeaveRequest({}, fd({ id: req.id }))).error).toMatch(/pending/i);
    const pending = await prisma.leaveRequest.findFirstOrThrow({ where: { tenantId, days: 1, status: "PENDING" } });
    expect((await cancelLeaveRequest({}, fd({ id: pending.id }))).ok).toBe(true);
    expect((await ask({ startDate: "2026-06-01", endDate: "2026-06-01", days: "1" })).ok).toBe(true);
    expect(await prisma.auditEvent.count({ where: { chainKey: tenantId, action: { in: ["leave.requested", "leave.cancelled"] } } })).toBe(4);
  });
});
