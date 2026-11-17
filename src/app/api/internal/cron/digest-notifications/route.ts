// NTF-006: Daily digest — batch unread notification summaries and send
// one consolidated email per user. Triggered by an external scheduler.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notify";
import { checkCronAuth } from "@/lib/cron-auth";

export async function GET(req: NextRequest) {
  const denied = checkCronAuth(req.headers.get("authorization"));
  if (denied) return denied;

  // Collect each user's unread messages from the past 24 hours.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const unread = await prisma.message.groupBy({
    by: ["recipientUserId", "tenantId"],
    where: { readAt: null, createdAt: { gte: since } },
    _count: { id: true },
  });

  let dispatched = 0;
  for (const row of unread) {
    if (!row.recipientUserId) continue;
    const count = row._count.id;
    if (count === 0) continue;

    // Deduplication: only send digest if not already sent today.
    const today = new Date().toISOString().slice(0, 10);
    await notify({
      tenantId: row.tenantId,
      recipientUserId: row.recipientUserId,
      category: "ANNOUNCEMENT",
      title: `You have ${count} unread notification${count > 1 ? "s" : ""}`,
      body: `Visit your portal to catch up on ${count} unread notification${count > 1 ? "s" : ""} from the past 24 hours.`,
      dedupeKey: `digest:${row.recipientUserId}:${today}`,
    });
    dispatched++;
  }

  return NextResponse.json({ ok: true, dispatched });
}
