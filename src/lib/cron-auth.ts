import "server-only";
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

// Shared guard for the internal cron handlers. Fails CLOSED: if CRON_SECRET is
// not configured the endpoint refuses every request, so a missing env var in a
// deployment can never silently expose a publicly-triggerable job.
export function checkCronAuth(authHeader: string | null): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Cron endpoint is not configured. Set CRON_SECRET." },
      { status: 503 },
    );
  }

  const expected = `Bearer ${secret}`;
  const got = authHeader ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
