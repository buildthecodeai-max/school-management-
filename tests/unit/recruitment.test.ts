import { describe, it, expect } from "vitest";
import { ACTIVE_STAGES, CLOSED_STAGES, stageLabel, stageMoveError } from "@/lib/recruitment";

describe("applicant stage moves", () => {
  it("allows moving freely between active stages, forward or back", () => {
    for (const from of ACTIVE_STAGES)
      for (const to of ACTIVE_STAGES) {
        if (from !== to) expect(stageMoveError(from, to)).toBeNull();
      }
  });

  it("allows rejecting or withdrawing from any active stage", () => {
    for (const from of ACTIVE_STAGES) {
      expect(stageMoveError(from, "REJECTED")).toBeNull();
      expect(stageMoveError(from, "WITHDRAWN")).toBeNull();
    }
  });

  it("never allows a plain move to HIRED (only the hire action creates staff)", () => {
    for (const from of ACTIVE_STAGES) expect(stageMoveError(from, "HIRED")).toMatch(/Hire action/);
  });

  it("treats closed stages as final", () => {
    for (const from of CLOSED_STAGES)
      for (const to of [...ACTIVE_STAGES, ...CLOSED_STAGES])
        expect(stageMoveError(from, to)).toMatch(/already/i);
  });

  it("rejects a move to the stage the applicant is already in", () => {
    expect(stageMoveError("INTERVIEW", "INTERVIEW")).toMatch(/already at/i);
  });

  it("formats stage labels", () => {
    expect(stageLabel("SCREENING")).toBe("Screening");
  });
});
