import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runGlobalSearch } from "@/lib/search-core";
import {
  prisma,
  makeTenant,
  makeCampus,
  makeStudent,
  makeUser,
  authContextFor,
  cleanupAll,
} from "./helpers";

// Regression guard for the global-search defects fixed this session (UX-003 / P0-3):
//  1. campus-scoped users must still get results (the old `can()` gate returned
//     nothing for them);
//  2. a permission held on one campus must not surface another campus's records;
//  3. nothing crosses the tenant boundary.

describe("global search scoping (UX-003)", () => {
  let tenantA: string;
  let tenantB: string;
  let campusA1: string;
  let campusA2: string;
  let orgUserA: string;
  let campusUserA1: string;
  let userB: string;

  beforeAll(async () => {
    tenantA = (await makeTenant("Search A")).id;
    tenantB = (await makeTenant("Search B")).id;
    campusA1 = (await makeCampus(tenantA, "North")).id;
    campusA2 = (await makeCampus(tenantA, "South")).id;
    const campusB = (await makeCampus(tenantB)).id;

    await makeStudent({
      tenantId: tenantA,
      campusId: campusA1,
      firstName: "Zenith",
      lastName: "Northman",
      admissionNumber: "ZN-1",
    });
    await makeStudent({
      tenantId: tenantA,
      campusId: campusA2,
      firstName: "Zenith",
      lastName: "Southman",
      admissionNumber: "ZS-1",
    });
    await makeStudent({
      tenantId: tenantB,
      campusId: campusB,
      firstName: "Zenith",
      lastName: "Bravo",
      admissionNumber: "ZB-1",
    });

    orgUserA = (
      await makeUser({ tenantId: tenantA, permissions: ["student.read"], scope: "ORG" })
    ).id;
    campusUserA1 = (
      await makeUser({
        tenantId: tenantA,
        permissions: ["student.read"],
        scope: "CAMPUS",
        campusId: campusA1,
      })
    ).id;
    userB = (
      await makeUser({ tenantId: tenantB, permissions: ["student.read"], scope: "ORG" })
    ).id;
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it("org-wide user sees every campus in their tenant", async () => {
    const ctx = await authContextFor(orgUserA);
    const labels = (await runGlobalSearch(ctx, "Zenith")).map((r) => r.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Zenith Northman", "Zenith Southman"]),
    );
    expect(labels).not.toContain("Zenith Bravo");
  });

  it("campus-scoped user still gets results — and only their campus", async () => {
    const ctx = await authContextFor(campusUserA1);
    const labels = (await runGlobalSearch(ctx, "Zenith")).map((r) => r.label);
    expect(labels).toContain("Zenith Northman"); // P0-3: was empty under the old can() gate
    expect(labels).not.toContain("Zenith Southman"); // other campus, same tenant
    expect(labels).not.toContain("Zenith Bravo"); // other tenant
  });

  it("a user in tenant B never sees tenant A students", async () => {
    const ctx = await authContextFor(userB);
    const labels = (await runGlobalSearch(ctx, "Zenith")).map((r) => r.label);
    expect(labels).toEqual(["Zenith Bravo"]);
  });

  it("a user without student.read gets no student hits", async () => {
    const noPerm = await makeUser({
      tenantId: tenantA,
      permissions: ["library.read"],
      scope: "ORG",
    });
    const ctx = await authContextFor(noPerm.id);
    expect(await runGlobalSearch(ctx, "Zenith")).toHaveLength(0);
  });

  it("short queries return nothing", async () => {
    const ctx = await authContextFor(orgUserA);
    expect(await runGlobalSearch(ctx, "Z")).toHaveLength(0);
  });
});
