import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { canPreferCampus } from "@/lib/campus-preference";
import {
  prisma,
  makeTenant,
  makeCampus,
  makeUser,
  authContextFor,
  cleanupAll,
} from "./helpers";

// Regression guard for the campus-switch authorization defect fixed this
// session (UX-006 / P0-4). Before the fix the route stored any campusId from
// the request body with no checks at all.

describe("campus preference authorization (UX-006)", () => {
  let tenantA: string;
  let tenantB: string;
  let campusA1: string;
  let campusA2: string;
  let campusB: string;
  let orgUserA: string;
  let campusUserA1: string;

  beforeAll(async () => {
    tenantA = (await makeTenant("Switch A")).id;
    tenantB = (await makeTenant("Switch B")).id;
    campusA1 = (await makeCampus(tenantA)).id;
    campusA2 = (await makeCampus(tenantA)).id;
    campusB = (await makeCampus(tenantB)).id;
    orgUserA = (
      await makeUser({ tenantId: tenantA, permissions: ["campus.read"], scope: "ORG" })
    ).id;
    campusUserA1 = (
      await makeUser({
        tenantId: tenantA,
        permissions: ["campus.read"],
        scope: "CAMPUS",
        campusId: campusA1,
      })
    ).id;
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it("org-wide user may prefer any campus in their tenant", async () => {
    const ctx = await authContextFor(orgUserA);
    expect(await canPreferCampus(ctx, campusA1)).toBe(true);
    expect(await canPreferCampus(ctx, campusA2)).toBe(true);
  });

  it("org-wide user may NOT prefer a campus in another tenant", async () => {
    const ctx = await authContextFor(orgUserA);
    expect(await canPreferCampus(ctx, campusB)).toBe(false);
  });

  it("campus-scoped user may prefer only their assigned campus", async () => {
    const ctx = await authContextFor(campusUserA1);
    expect(await canPreferCampus(ctx, campusA1)).toBe(true);
    expect(await canPreferCampus(ctx, campusA2)).toBe(false); // same tenant, unassigned
    expect(await canPreferCampus(ctx, campusB)).toBe(false); // other tenant
  });

  it("a made-up or empty campus id is rejected", async () => {
    const ctx = await authContextFor(orgUserA);
    expect(await canPreferCampus(ctx, "does-not-exist")).toBe(false);
    expect(await canPreferCampus(ctx, "")).toBe(false);
  });
});
