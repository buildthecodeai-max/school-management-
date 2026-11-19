import { redirect } from "next/navigation";
import { requireUser, can, canAnywhere } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PlatformDashboard } from "@/components/dashboards/PlatformDashboard";
import { GuardianDashboard } from "@/components/dashboards/GuardianDashboard";
import { StaffDashboard } from "@/components/dashboards/StaffDashboard";
import { FinanceDashboard } from "@/components/dashboards/FinanceDashboard";
import { AdmissionsDashboard } from "@/components/dashboards/AdmissionsDashboard";

export default async function DashboardPage() {
  const ctx = await requireUser();

  if (ctx.isPlatformStaff && !ctx.tenantId) {
    return <PlatformDashboard />;
  }

  // TEN-005: suspended tenants land on a dedicated notice.
  if (ctx.isSuspended) {
    redirect("/portal/suspended");
  }

  // Guardian persona: linked to a Guardian profile and without staff-level read.
  if (ctx.user.person && !can(ctx, "student.read")) {
    const guardian = await prisma.guardian.findUnique({
      where: { personId: ctx.user.person.id },
    });
    if (guardian) {
      return <GuardianDashboard ctx={ctx} guardianId={guardian.id} />;
    }
  }

  // A student signed in to their own account goes to their own page.
  if (ctx.user.personId && !can(ctx, "student.read") && !canAnywhere(ctx, "student.read")) {
    const own = await prisma.student.findFirst({ where: { personId: ctx.user.personId, tenantId: ctx.tenantId! }, select: { id: true } });
    if (own) redirect(`/portal/family/${own.id}`);
  }

  // Role-scoped dashboard routing (UX). These use `canAnywhere` because the
  // finance/admissions roles are granted per-campus, and `can()` only sees
  // org-wide grants — with it, both roles fell through to StaffDashboard.
  // Finance-only role — can bill but not manage students.
  if (canAnywhere(ctx, "fee.bill") && !canAnywhere(ctx, "student.write")) {
    return <FinanceDashboard ctx={ctx} />;
  }

  // Admissions-only role — works applications but has no attendance duties.
  if (canAnywhere(ctx, "admissions.write") && !canAnywhere(ctx, "attendance.read")) {
    return <AdmissionsDashboard ctx={ctx} />;
  }

  return <StaffDashboard ctx={ctx} />;
}
