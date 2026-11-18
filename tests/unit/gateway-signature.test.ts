import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { gatewayEventSchema, signGatewayPayload, verifyGatewaySignature } from "@/lib/gateway-webhooks";

const SECRET = "whsec_test_secret";
const body = JSON.stringify({ id: "evt_1", type: "payment.succeeded", data: { reference: "ch_1", amount: 1000 } });
const NOW = 1_800_000_000_000; // ms
const ts = NOW / 1000;

describe("gateway webhook signature", () => {
  it("accepts a correctly signed, fresh request", () => {
    expect(verifyGatewaySignature(SECRET, signGatewayPayload(SECRET, ts, body), body, NOW)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const header = signGatewayPayload(SECRET, ts, body);
    expect(verifyGatewaySignature(SECRET, header, body.replace("1000", "9999"), NOW)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    expect(verifyGatewaySignature(SECRET, signGatewayPayload("other", ts, body), body, NOW)).toBe(false);
  });

  it("rejects a replay outside the 5 minute window, past or future", () => {
    const old = signGatewayPayload(SECRET, ts - 301, body);
    const future = signGatewayPayload(SECRET, ts + 301, body);
    expect(verifyGatewaySignature(SECRET, old, body, NOW)).toBe(false);
    expect(verifyGatewaySignature(SECRET, future, body, NOW)).toBe(false);
    expect(verifyGatewaySignature(SECRET, signGatewayPayload(SECRET, ts - 299, body), body, NOW)).toBe(true);
  });

  it("binds the timestamp into the MAC (cannot reuse a signature with a new timestamp)", () => {
    const v1 = signGatewayPayload(SECRET, ts - 400, body).split("v1=")[1];
    expect(verifyGatewaySignature(SECRET, `t=${ts},v1=${v1}`, body, NOW)).toBe(false);
  });

  it("rejects missing, malformed and wrong-length headers without throwing", () => {
    for (const header of [null, "", "garbage", "t=abc,v1=00", `t=${ts}`, `t=${ts},v1=`, `t=${ts},v1=abcd`])
      expect(verifyGatewaySignature(SECRET, header, body, NOW)).toBe(false);
  });
});

describe("gateway event schema", () => {
  const ok = { id: "e", type: "payment.succeeded", data: { reference: "r", amount: 500 } };

  it("accepts a minimal valid event", () => {
    expect(gatewayEventSchema.safeParse(ok).success).toBe(true);
  });

  it.each([
    ["zero amount", { ...ok, data: { ...ok.data, amount: 0 } }],
    ["negative amount", { ...ok, data: { ...ok.data, amount: -5 } }],
    ["fractional amount", { ...ok, data: { ...ok.data, amount: 10.5 } }],
    ["string amount", { ...ok, data: { ...ok.data, amount: "500" } }],
    ["missing reference", { ...ok, data: { amount: 500 } }],
    ["missing id", { type: ok.type, data: ok.data }],
  ])("rejects %s", (_label, event) => {
    expect(gatewayEventSchema.safeParse(event).success).toBe(false);
  });
});
