import { describe, it, expect } from "vitest";
import { documentLabel, expiryState } from "@/lib/student-documents";

describe("document expiry", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000);
  it("classifies expiry", () => {
    expect(expiryState(null, now)).toBe("none");
    expect(expiryState(inDays(-1), now)).toBe("expired");
    expect(expiryState(inDays(30), now)).toBe("soon");
    expect(expiryState(inDays(31), now)).toBe("ok");
  });
  it("labels types", () => expect(documentLabel("BIRTH_CERTIFICATE")).toBe("Birth certificate"));
});
