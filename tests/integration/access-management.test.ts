import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { createSchoolUser, grantRole, revokeRole, setUserActive, issueInvite } from "@/app/portal/settings/users/actions";
import { createRole, updateRole, duplicateRole, deleteRole } from "@/app/portal/settings/roles/actions";
import { resetPasswordAction } from "@/app/login/reset-password/actions";
import { prisma, makeTenant, makeCampus, makeUser, authContextFor, cleanupAll, uid } from "./helpers";

const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x); return f; };

describe("school-owner user and role management", () => {
  let tenantId: string, campusA: string, campusB: string;
  let owner: unknown, ownerId: string, campusMgr: unknown, campusMgrId: string, plain: unknown, otherOwner: unknown;
  let teacherRole: string, financeRole: string, strongRole: string, foreignRole: string, systemRole: string;
  let foreignUserId: string;

  const role = (name: string, permissions: string[], tid: string | null = tenantId) => prisma.role.create({ data: { tenantId: tid, name, permissions } }).then((r) => r.id);

  beforeAll(async () => {
    tenantId = (await makeTenant("Access Org")).id;
    campusA = (await makeCampus(tenantId, "A")).id;
    campusB = (await makeCampus(tenantId, "B")).id;
    const o = await makeUser({ tenantId, permissions: ["iam.users.manage", "iam.roles.manage", "student.read", "fee.read", "fee.adjust", "attendance.read", "attendance.write"], scope: "ORG" });
    ownerId = o.id; owner = await authContextFor(o.id);
    const m = await makeUser({ tenantId, permissions: ["iam.users.manage", "student.read", "fee.read"], scope: "CAMPUS", campusId: campusA });
    campusMgrId = m.id; campusMgr = await authContextFor(m.id);
    plain = await authContextFor((await makeUser({ tenantId, permissions: ["student.read"], scope: "ORG" })).id);
    teacherRole = await role("Teacher-ish", ["student.read", "attendance.read", "attendance.write"]);
    financeRole = await role("Finance-ish", ["fee.read", "fee.adjust"]);
    strongRole = await role("Strong", ["student.read", "fee.read", "fee.adjust", "attendance.read", "iam.users.manage"]);
    systemRole = await role("System role", ["student.read"], null);
    const t2 = (await makeTenant("Other Access Org")).id;
    foreignRole = await role("Foreign", ["student.read"], t2);
    const fo = await makeUser({ tenantId: t2, permissions: ["iam.users.manage", "iam.roles.manage"], scope: "ORG" });
    foreignUserId = fo.id; otherOwner = await authContextFor(fo.id);
  });
  afterAll(async () => { await prisma.role.deleteMany({ where: { tenantId: null, name: "System role" } }); await cleanupAll(); });

  const add = (o: Record<string, string> = {}) => createSchoolUser({}, fd({ displayName: "Tina Teacher", email: `${uid("t")}@school.test`, roleId: teacherRole, scopeType: "ORG", profile: "STAFF", ...o }));
  const userByEmail = (email: string) => prisma.user.findFirstOrThrow({ where: { email }, include: { roleAssignments: true, person: { include: { staff: true } } } });

  describe("creating users", () => {
    it("needs the permission, valid input and a role from this school", async () => {
      current = plain;
      expect((await add()).error).toMatch(/organization-wide manager|do not manage/i);
      current = owner;
      expect((await add({ email: "nope" })).error).toMatch(/valid email/i);
      expect((await add({ displayName: "x" })).error).toMatch(/name/i);
      expect((await add({ roleId: foreignRole })).error).toMatch(/role from this school/i);
      expect((await add({ roleId: systemRole })).error).toMatch(/role from this school/i);
      expect((await add({ scopeType: "CAMPUS", campusId: "nope" })).error).toMatch(/campus from this school/i);
      expect((await add({ profile: "ADMIN" })).error).toMatch(/profile/i);
      const dupe = (await prisma.user.findFirstOrThrow({ where: { id: foreignUserId } })).email;
      expect((await add({ email: dupe.toUpperCase() })).error).toMatch(/already has an account/i);
    });

    it("creates the account with a staff profile, an unusable password and a one-time invite", async () => {
      current = owner;
      const email = `${uid("new")}@school.test`;
      const r = await add({ email });
      expect(r.ok).toBe(true);
      expect(r.inviteUrl).toMatch(/\/login\/reset-password\?token=[0-9a-f]{64}$/);
      const u = await userByEmail(email);
      expect(u.person?.staff).not.toBeNull();
      expect(u.roleAssignments).toHaveLength(1);
      expect(u.passwordResetToken).toBe(r.inviteUrl!.split("token=")[1]);
      expect(u.passwordResetTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
      expect((await prisma.auditEvent.findFirstOrThrow({ where: { chainKey: tenantId, action: "iam.user.created", targetId: u.id } })).metadata).toMatchObject({ email, role: "Teacher-ish" });
      // the person completes the invite with the real reset flow
      const done = await resetPasswordAction({}, fd({ token: u.passwordResetToken!, newPassword: "Chosen-Pass1", confirmPassword: "Chosen-Pass1" }));
      expect(done.success).toBe(true);
    });

    it("never lets a manager hand out more than they hold", async () => {
      current = owner;
      expect((await add({ roleId: strongRole })).ok).toBe(true); // owner holds all of it
      current = campusMgr;
      expect((await add({ roleId: teacherRole, scopeType: "CAMPUS", campusId: campusA })).error).toMatch(/you cannot give/i); // lacks attendance.write
      expect((await add({ roleId: financeRole, scopeType: "CAMPUS", campusId: campusA })).error).toMatch(/fee\.adjust/);
      const ok = await createSchoolUser({}, fd({ displayName: "Cam Clerk", email: `${uid("c")}@school.test`, roleId: await role("Reader", ["student.read", "fee.read"]), scopeType: "CAMPUS", campusId: campusA, profile: "NONE" }));
      expect(ok.ok).toBe(true);
      expect((await createSchoolUser({}, fd({ displayName: "Cam Clerk", email: `${uid("c")}@school.test`, roleId: (await prisma.role.findFirstOrThrow({ where: { tenantId, name: "Reader" } })).id, scopeType: "CAMPUS", campusId: campusB, profile: "NONE" }))).error).toMatch(/do not manage users on that campus/i);
      expect((await createSchoolUser({}, fd({ displayName: "Org Clerk", email: `${uid("c")}@school.test`, roleId: (await prisma.role.findFirstOrThrow({ where: { tenantId, name: "Reader" } })).id, scopeType: "ORG", profile: "NONE" }))).error).toMatch(/organization-wide manager/i);
    });
  });

  describe("granting, revoking and disabling", () => {
    let targetId: string, assignmentId: string;
    beforeAll(async () => {
      current = owner;
      const email = `${uid("tgt")}@school.test`;
      await add({ email });
      const u = await userByEmail(email);
      targetId = u.id; assignmentId = u.roleAssignments[0].id;
    });

    it("grants roles within limits and not to oneself", async () => {
      current = owner;
      expect((await grantRole({}, fd({ userId: ownerId, roleId: teacherRole, scopeType: "ORG" }))).error).toMatch(/own access/i);
      expect((await grantRole({}, fd({ userId: foreignUserId, roleId: teacherRole, scopeType: "ORG" }))).error).toMatch(/user not found/i);
      expect((await grantRole({}, fd({ userId: targetId, roleId: foreignRole, scopeType: "ORG" }))).error).toMatch(/role from this school/i);
      expect((await grantRole({}, fd({ userId: targetId, roleId: teacherRole, scopeType: "ORG" }))).error).toMatch(/already have/i);
      expect((await grantRole({}, fd({ userId: targetId, roleId: financeRole, scopeType: "CAMPUS", campusId: campusA }))).ok).toBe(true);
      current = plain;
      expect((await grantRole({}, fd({ userId: targetId, roleId: financeRole, scopeType: "ORG" }))).error).toMatch(/organization-wide manager|outside what you manage/i);
    });

    it("stops a campus manager touching people with wider or stronger access", async () => {
      current = campusMgr;
      // the owner has org-wide access and more permissions than the campus manager
      expect((await issueInvite({}, fd({ userId: ownerId }))).error).toMatch(/outside what you manage|permissions you do not have/i);
      expect((await setUserActive({}, fd({ userId: ownerId, to: "DISABLED" }))).error).toMatch(/outside what you manage|permissions you do not have/i);
      expect((await grantRole({}, fd({ userId: ownerId, roleId: teacherRole, scopeType: "ORG" }))).error).toMatch(/outside what you manage|permissions you do not have/i);
      // the target has an org-wide role too, so a campus manager cannot reset their password
      expect((await issueInvite({}, fd({ userId: targetId }))).error).toMatch(/outside what you manage|permissions you do not have/i);
      const assignments = await prisma.roleAssignment.findMany({ where: { userId: targetId } });
      current = campusMgr;
      expect((await revokeRole({}, fd({ assignmentId: assignments[0].id }))).error).toMatch(/outside what you manage|permissions you do not have/i);
    });

    it("keeps at least one role, signs people out when disabled, and enables again", async () => {
      current = owner;
      const second = await prisma.roleAssignment.findFirstOrThrow({ where: { userId: targetId, scopeType: "CAMPUS" } });
      expect((await revokeRole({}, fd({ assignmentId: second.id }))).ok).toBe(true);
      expect((await revokeRole({}, fd({ assignmentId }))).error).toMatch(/only role/i);
      await prisma.session.create({ data: { userId: targetId, token: uid("tok"), expiresAt: new Date(Date.now() + 3_600_000) } });
      expect((await setUserActive({}, fd({ userId: ownerId, to: "DISABLED" }))).error).toMatch(/own account/i);
      expect((await setUserActive({}, fd({ userId: targetId, to: "DISABLED" }))).ok).toBe(true);
      expect(await prisma.session.count({ where: { userId: targetId } })).toBe(0);
      expect((await setUserActive({}, fd({ userId: targetId, to: "DISABLED" }))).error).toMatch(/already disabled/i);
      expect((await issueInvite({}, fd({ userId: targetId }))).error).toMatch(/enable the account/i);
      expect((await setUserActive({}, fd({ userId: targetId, to: "ACTIVE" }))).ok).toBe(true);
      const inv = await issueInvite({}, fd({ userId: targetId }));
      expect(inv.ok).toBe(true);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: targetId } })).passwordResetToken).toBe(inv.inviteUrl!.split("token=")[1]);
    });

    it("lets one org-wide manager disable another while somebody who can manage access always remains", async () => {
      current = owner;
      const mgrRole = await role("Mgr", ["iam.users.manage", "student.read"]);
      const email = `${uid("second")}@school.test`;
      expect((await createSchoolUser({}, fd({ displayName: "Second Manager", email, roleId: mgrRole, scopeType: "ORG", profile: "NONE" }))).ok).toBe(true);
      const second = await userByEmail(email);
      const managers = () => prisma.user.count({ where: { tenantId, status: "ACTIVE", roleAssignments: { some: { scopeType: "ORG", role: { permissions: { has: "iam.users.manage" } } } } } });
      const before = await managers();
      expect((await setUserActive({}, fd({ userId: second.id, to: "DISABLED" }))).ok).toBe(true);
      expect(await managers()).toBe(before - 1);
      expect(await managers()).toBeGreaterThanOrEqual(1); // the actor is always one of them, and cannot disable themselves
      expect((await setUserActive({}, fd({ userId: ownerId, to: "DISABLED" }))).error).toMatch(/own account/i);
      expect((await revokeRole({}, fd({ assignmentId: (await prisma.roleAssignment.findFirstOrThrow({ where: { userId: ownerId } })).id }))).error).toMatch(/own access/i);
    });
  });

  describe("roles", () => {
    const create = (o: Record<string, string | string[]> = {}) => createRole({}, fd({ name: uid("Role"), permissions: ["student.read"], ...o }));

    it("needs organization-wide role rights", async () => {
      current = campusMgr;
      expect((await create()).error).toMatch(/role manager/i);
      current = plain;
      expect((await create()).error).toMatch(/role manager/i);
    });

    it("creates custom roles from known school permissions the manager holds", async () => {
      current = owner;
      expect((await create({ name: "x" })).error).toMatch(/2 to 60/);
      expect((await create({ name: "Teacher" })).error).toMatch(/built-in/i);
      expect((await create({ permissions: [] })).error).toMatch(/at least one/i);
      expect((await create({ permissions: ["platform.manage"] })).error).toMatch(/platform permissions/i);
      expect((await create({ permissions: ["*"] })).error).toMatch(/platform permissions/i);
      expect((await create({ permissions: ["made.up"] })).error).toMatch(/unknown/i);
      expect((await create({ permissions: ["finance.write"] })).error).toMatch(/do not hold/i);
      const name = uid("Exam Officer");
      const r = await create({ name, permissions: ["student.read", "attendance.read"] });
      expect(r.ok).toBe(true);
      expect((await create({ name })).error).toMatch(/already exists/i);
      expect((await prisma.role.findUniqueOrThrow({ where: { id: r.roleId! } })).permissions.sort()).toEqual(["attendance.read", "student.read"]);
    });

    it("edits only custom roles, refuses other schools' roles, and applies changes with an audit trail", async () => {
      current = owner;
      const mk = await create({ name: uid("Editable"), permissions: ["student.read"] });
      const id = mk.roleId!;
      const builtIn = await prisma.role.create({ data: { tenantId, name: "Teacher", permissions: ["student.read"] } });
      expect((await updateRole({}, fd({ roleId: builtIn.id, name: "Teacher", permissions: ["student.read"] }))).error).toMatch(/built-in/i);
      expect((await updateRole({}, fd({ roleId: foreignRole, name: "Hijack", permissions: ["student.read"] }))).error).toMatch(/role not found/i);
      expect((await updateRole({}, fd({ roleId: id, name: "Teacher", permissions: ["student.read"] }))).error).toMatch(/built-in/i);
      const u = await updateRole({}, fd({ roleId: id, name: uid("Renamed"), permissions: ["student.read", "fee.read"] }));
      expect(u.ok).toBe(true);
      const ev = await prisma.auditEvent.findFirstOrThrow({ where: { chainKey: tenantId, action: "iam.role.updated", targetId: id } });
      expect(ev.metadata).toMatchObject({ added: ["fee.read"], removed: [] });
      // someone assigned to the role is told the change is live
      const email = `${uid("e")}@school.test`;
      await createSchoolUser({}, fd({ displayName: "Eddie Edit", email, roleId: id, scopeType: "ORG", profile: "NONE" }));
      expect((await updateRole({}, fd({ roleId: id, name: uid("Renamed2"), permissions: ["student.read"] }))).message).toMatch(/1 assignment/);
    });

    it("will not strip the last manager's management right, duplicates, and deletes only unused roles", async () => {
      current = owner;
      // make a role that is the only source of management rights for an org-wide manager
      const solo = await prisma.role.create({ data: { tenantId: (await prisma.tenant.create({ data: { name: "Solo", slug: uid("solo"), status: "ACTIVE" } })).id, name: "SoloMgr", permissions: ["iam.users.manage", "iam.roles.manage", "student.read"] } });
      const soloUser = await prisma.user.create({ data: { tenantId: solo.tenantId, email: `${uid("s")}@solo.test`, displayName: "Solo", passwordHash: "x", roleAssignments: { create: { roleId: solo.id, scopeType: "ORG" } } } });
      const soloCtx = await authContextFor(soloUser.id);
      current = soloCtx;
      const blocked = await updateRole({}, fd({ roleId: solo.id, name: "SoloMgr", permissions: ["iam.roles.manage", "student.read"] }));
      expect(blocked.error).toMatch(/only organization-wide manager/i);
      expect((await prisma.role.findUniqueOrThrow({ where: { id: solo.id } })).permissions).toContain("iam.users.manage");

      current = owner;
      const src = await create({ name: uid("Source"), permissions: ["student.read", "fee.read"] });
      const copy = await duplicateRole({}, fd({ roleId: src.roleId! }));
      expect(copy.ok).toBe(true);
      expect((await prisma.role.findUniqueOrThrow({ where: { id: copy.roleId! } })).name).toMatch(/\(copy\)$/);
      expect((await duplicateRole({}, fd({ roleId: foreignRole }))).error).toMatch(/role not found/i);
      const used = await create({ name: uid("Used"), permissions: ["student.read"] });
      await createSchoolUser({}, fd({ displayName: "Uma Used", email: `${uid("u")}@school.test`, roleId: used.roleId!, scopeType: "ORG", profile: "NONE" }));
      expect((await deleteRole({}, fd({ roleId: used.roleId! }))).error).toMatch(/still use this role/i);
      expect((await deleteRole({}, fd({ roleId: copy.roleId! }))).ok).toBe(true);
      current = otherOwner;
      expect((await deleteRole({}, fd({ roleId: src.roleId! }))).error).toMatch(/role not found/i);
    });
  });
});
