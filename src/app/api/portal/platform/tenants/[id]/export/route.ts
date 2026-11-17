// TEN-006: Tenant data export — produces a structured JSON download of all
// tenant data for GDPR/data-portability compliance. The download is gated on
// platform.manage and records a dataExportedAt timestamp on the tenant row so
// the deletion-evidence UI can verify the export happened before deletion.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!ctx.isPlatformStaff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: tenantId } = await params;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Collect all tenant data in parallel
  const [
    campuses,
    users,
    students,
    enrollments,
    staff,
    invoices,
    payments,
    attendanceSessions,
    assessmentPlans,
    leaveRequests,
    libraryItems,
    routes,
    inventoryItems,
    safeguardingCases,
    auditEvents,
  ] = await Promise.all([
    prisma.campus.findMany({ where: { tenantId } }),
    prisma.user.findMany({ where: { tenantId }, select: { id: true, email: true, displayName: true, createdAt: true, status: true } }),
    prisma.student.findMany({ where: { tenantId }, include: { person: true } }),
    prisma.enrollment.findMany({ where: { tenantId } }),
    prisma.staff.findMany({ where: { tenantId }, include: { person: true } }),
    prisma.invoice.findMany({ where: { tenantId }, include: { lines: true } }),
    prisma.payment.findMany({ where: { tenantId } }),
    prisma.attendanceSession.findMany({ where: { tenantId }, include: { records: true }, take: 10000 }),
    prisma.assessmentPlan.findMany({ where: { tenantId } }),
    prisma.leaveRequest.findMany({ where: { tenantId } }),
    prisma.libraryItem.findMany({ where: { tenantId } }),
    prisma.route.findMany({ where: { tenantId } }),
    prisma.inventoryItem.findMany({ where: { tenantId } }),
    prisma.safeguardingCase.findMany({ where: { tenantId } }),
    prisma.auditEvent.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 5000 }),
  ]);

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    exportedBy: ctx.user.id,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAt: tenant.createdAt,
    },
    summary: {
      campuses: campuses.length,
      users: users.length,
      students: students.length,
      enrollments: enrollments.length,
      staff: staff.length,
      invoices: invoices.length,
      payments: payments.length,
      attendanceSessions: attendanceSessions.length,
      assessmentPlans: assessmentPlans.length,
    },
    data: {
      campuses,
      users,
      students,
      enrollments,
      staff,
      invoices,
      payments,
      attendanceSessions,
      assessmentPlans,
      leaveRequests,
      libraryItems,
      routes,
      inventoryItems,
      safeguardingCases,
      auditEvents,
    },
  };

  // Record that an export was taken
  await Promise.all([
    prisma.tenant.update({
      where: { id: tenantId },
      data: { dataExportedAt: new Date() },
    }),
    audit({
      tenantId: null,
      actorUserId: ctx.user.id,
      action: "platform.tenant.data_exported",
      targetType: "Tenant",
      targetId: tenantId,
      scopeType: "PLATFORM",
      metadata: { name: tenant.name, recordCounts: exportPayload.summary },
    }),
  ]);

  const json = JSON.stringify(exportPayload, null, 2);
  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="tenant-export-${tenant.slug}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
