import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// In-memory cookie jar standing in for next/headers.
const store = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (store.has(k) ? { value: store.get(k)! } : undefined),
    set: (k: string, v: string) => void store.set(k, v),
    delete: (k: string) => void store.delete(k),
  }),
}));

import { completeMfaSession, createSession, getPendingMfaSession, getSessionUser, hasActiveMfa } from "@/lib/auth";
import { prisma, makeTenant, makeUser, cleanupAll } from "./helpers";

// SEC-002: a password alone must not produce a usable session for a user with
// two-factor enrolled.
describe("two-factor sign-in gate", () => {
  let mfaUserId: string;
  let plainUserId: string;

  beforeAll(async () => {
    const tenantId = (await makeTenant("MFA Org")).id;
    mfaUserId = (await makeUser({ tenantId, permissions: ["student.read"], scope: "ORG" })).id;
    plainUserId = (await makeUser({ tenantId, permissions: ["student.read"], scope: "ORG" })).id;
    await prisma.user.update({ where: { id: mfaUserId }, data: { mfaSecret: "JBSWY3DPEHPK3PXP" } });
  });
  afterAll(cleanupAll);

  it("recognises an active secret but not a pending enrolment", () => {
    expect(hasActiveMfa("JBSWY3DPEHPK3PXP")).toBe(true);
    expect(hasActiveMfa("pending:JBSWY3DPEHPK3PXP")).toBe(false);
    expect(hasActiveMfa(null)).toBe(false);
  });

  it("a pending session grants no access until the code step completes", async () => {
    store.clear();
    await createSession(mfaUserId, undefined, { mfaPending: true });
    expect(await getSessionUser()).toBeNull();
    const pending = await getPendingMfaSession();
    expect(pending?.user.id).toBe(mfaUserId);

    await completeMfaSession(pending!.sessionId);
    expect((await getSessionUser())?.id).toBe(mfaUserId);
    expect(await getPendingMfaSession()).toBeNull();
  });

  it("a pending session is short-lived and an ordinary session is unaffected", async () => {
    store.clear();
    await createSession(mfaUserId, undefined, { mfaPending: true });
    const row = await prisma.session.findFirstOrThrow({ where: { token: store.get("sms_session") } });
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThan(11 * 60_000);

    store.clear();
    await createSession(plainUserId);
    expect((await getSessionUser())?.id).toBe(plainUserId);
  });

  it("an expired pending session cannot be completed", async () => {
    store.clear();
    await createSession(mfaUserId, undefined, { mfaPending: true });
    await prisma.session.updateMany({ where: { token: store.get("sms_session") }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getPendingMfaSession()).toBeNull();
    expect(await getSessionUser()).toBeNull();
  });
});
