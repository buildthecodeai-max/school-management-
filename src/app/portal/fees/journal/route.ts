// FEE-007: GL journal CSV export. Each invoice line maps to a GL account via FeeHead.glAccountCode.
import { NextRequest } from "next/server";
import { requireUser, canAnywhere } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { parseDay, formatDay } from "@/lib/attendance";
import { plainMoney } from "@/lib/fee-report-calc";
import { reportCsv } from "@/lib/report-format";

export async function GET(req: NextRequest) {
  const ctx = await requireUser();
  if (!canAnywhere(ctx, "fee.read")) return new Response("Access denied", { status: 403 });
  const p = new URL(req.url).searchParams;
  const allowed = allowedCampusIds(ctx, "fee.read");
  const campusId = p.get("campusId") || undefined;
  if (campusId && allowed && !allowed.includes(campusId)) return new Response("Campus not found", { status: 404 });
  const fromRaw = p.get("from"), toRaw = p.get("to");
  const from = fromRaw ? parseDay(fromRaw) : null, to = toRaw ? parseDay(toRaw) : null;
  if ((fromRaw && !from) || (toRaw && !to) || (from && to && from > to)) return new Response("Invalid date range", { status: 400 });
  const end = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999) : null;

  const lines = await prisma.invoiceLine.findMany({
    where: {
      tenantId: ctx.tenantId!,
      invoice: {
        // the caller's campuses, narrowed by the optional filter
        ...(campusId ? { campusId } : allowed ? { campusId: { in: allowed } } : {}),
        // both bounds live in one object so neither overwrites the other
        ...(from || end ? { issueDate: { ...(from ? { gte: from } : {}), ...(end ? { lte: end } : {}) } } : {}),
      },
    },
    include: { invoice: { include: { student: { include: { person: true } } } }, feeHead: true },
    orderBy: { invoice: { issueDate: "asc" } },
    take: 5000,
  });

  const rows = [
    ["Date", "Invoice", "Student", "Description", "GL Account", "Debit", "Credit"],
    ...lines.map((l) => [formatDay(l.invoice.issueDate), l.invoice.number, `${l.invoice.student.person.firstName} ${l.invoice.student.person.lastName}`, l.description, l.feeHead?.glAccountCode ?? "UNASSIGNED", plainMoney(l.amount), ""]),
  ];
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "fee.gl.export", targetType: "GLExport", metadata: { campusId: campusId ?? null, from: fromRaw, to: toRaw, lines: lines.length } });
  return new Response(reportCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="gl-journal-${formatDay(new Date())}.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
