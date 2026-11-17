import "server-only";
import { prisma } from "@/lib/db";
import { campusScopeFor, type AuthzContext } from "@/lib/rbac";
import type { PermissionKey } from "@/lib/permissions";
import { reportDates } from "./report-format";

export const reportCatalog = {
  finance: { title: "Income and expenses", permission: "finance.read" },
  payroll: { title: "Posted payroll", permission: "hr.payroll.read" },
  enrollment: { title: "Enrollment by section", permission: "student.read" },
} satisfies Record<string, { title: string; permission: PermissionKey }>;
export type ReportKind = keyof typeof reportCatalog;
export function reportScope(ctx: AuthzContext, kind: ReportKind, campusId?: string) {
  if (!ctx.tenantId) throw new Error("Select an organization first.");
  const scope = campusScopeFor(ctx, reportCatalog[kind].permission);
  if (scope?.length === 0 || (campusId && scope && !scope.includes(campusId))) throw new Error("Report access denied.");
  return { tenantId: ctx.tenantId, ...(campusId ? { campusId } : scope ? { campusId: { in: scope } } : {}) };
}
export async function getReport(ctx: AuthzContext, kind: ReportKind, campusId?: string, from?: string, to?: string) {
  const where = reportScope(ctx, kind, campusId);
  const dates = reportDates(from, to);
  if (kind === "finance") {
    const groups = await prisma.financeTransaction.groupBy({ by: ["campusId", "type"], where: { ...where, occurredAt: dates }, _sum: { amount: true }, _count: true });
    return { columns: ["Campus", "Transaction type", "Entries", "Amount (minor units)"], rows: groups.map(g => [g.campusId, g.type, String(g._count), String(g._sum.amount ?? 0)]) };
  }
  if (kind === "payroll") {
    const groups = await prisma.payslip.groupBy({ by: ["campusId"], where: { ...where, run: { status: "POSTED", postedAt: dates } }, _sum: { grossPay: true, deductions: true, netPay: true }, _count: true });
    return { columns: ["Campus", "Payslips", "Gross (minor units)", "Deductions (minor units)", "Net (minor units)"], rows: groups.map(g => [g.campusId, String(g._count), String(g._sum.grossPay ?? 0), String(g._sum.deductions ?? 0), String(g._sum.netPay ?? 0)]) };
  }
  const groups = await prisma.enrollment.groupBy({ by: ["campusId", "sectionId", "status"], where: { ...where, startDate: dates }, _count: true });
  const sections = await prisma.section.findMany({ where: { ...where }, select: { id: true, name: true, gradeLevel: { select: { name: true } }, academicYear: { select: { name: true } } } });
  return { columns: ["Campus", "Section", "Session", "Status", "Enrollments"], rows: groups.map(g => { const section = sections.find(s => s.id === g.sectionId); return [g.campusId, section ? `${section.gradeLevel.name} / ${section.name}` : g.sectionId, section?.academicYear.name ?? "", g.status, String(g._count)]; }) };
}
