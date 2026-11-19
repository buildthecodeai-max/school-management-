// SIS-004: Document expiry cron handler.
// Invocation infra (Vercel Cron / OS cron) is a documented external dependency —
// this handler is the testable code unit. Protect with a shared secret header
// so it can only be called from the scheduler, not the public internet.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getExpiringDocuments } from "@/lib/document-expiry";
import { notify } from "@/lib/notify";
import { checkCronAuth } from "@/lib/cron-auth";

export async function GET(req: NextRequest) {
  const denied = checkCronAuth(req.headers.get("authorization"));
  if (denied) return denied;

  const tenants = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });

  let totalProcessed = 0;
  for (const tenant of tenants) {
    const expiring = await getExpiringDocuments(tenant.id, 30);
    for (const doc of expiring) {
      // Notify guardians who receive notifications for this student.
      const guardianLinks = await prisma.guardianRelationship.findMany({
        where: { tenantId: tenant.id, studentId: doc.studentId, receivesNotifications: true },
        include: { guardian: { include: { person: { include: { user: true } } } } },
      });
      for (const link of guardianLinks) {
        const user = link.guardian.person.user;
        if (!user) continue;
        await notify({
          tenantId: tenant.id,
          recipientUserId: user.id,
          category: "ACADEMICS",
          title: `Document expiring soon — ${doc.student.person.firstName} ${doc.student.person.lastName}`,
          body: `${doc.docType} document (ref: ${doc.reference ?? "—"}) expires on ${doc.expiresAt?.toDateString() ?? "—"}.`,
          dataClassification: "INTERNAL",
          dedupeKey: `doc-expiry-${doc.id}-${user.id}`,
        });
      }
      totalProcessed++;
    }
  }

  return NextResponse.json({ ok: true, processed: totalProcessed });
}
