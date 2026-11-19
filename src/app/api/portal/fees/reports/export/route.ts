import { requireUser, canAnywhere } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { parseDay, formatDay } from "@/lib/attendance";
import { dayStart } from "@/lib/dates";
import { plainMoney } from "@/lib/fee-report-calc";
import { campusNames, collectionsReport, discountsReport, outstandingReport, refundsReport } from "@/lib/fee-reports";
import { reportCsv } from "@/lib/report-format";

const day = formatDay; // local calendar day, matching how ranges are interpreted

export async function GET(request: Request) {
  const ctx = await requireUser();
  if (!canAnywhere(ctx, "fee.read")) return new Response("Access denied", { status: 403 });
  const p = new URL(request.url).searchParams;
  const report = p.get("report") ?? "";
  const allowed = allowedCampusIds(ctx, "fee.read");
  const names = await campusNames(ctx.tenantId!);
  let campusId = p.get("campusId") || undefined;
  if (campusId && (!names.has(campusId) || (allowed && !allowed.includes(campusId)))) return new Response("Campus not found", { status: 404 });

  const today = dayStart();
  const from = parseDay(p.get("from")) ?? new Date(today.getFullYear(), today.getMonth(), 1);
  const to = parseDay(p.get("to")) ?? today;
  if (from > to) return new Response("Invalid date range", { status: 400 });
  const scope = { tenantId: ctx.tenantId!, campusIds: allowed, campusId };
  const cn = (id: string) => names.get(id) ?? "";

  let rows: string[][];
  if (report === "collections") {
    const d = await collectionsReport({ ...scope, from, to, method: p.get("method") || undefined });
    rows = [["Receipt", "Date", "Student", "Admission no.", "Campus", "Method", "Reference", "Amount"],
      ...d.rows.map((x) => [x.number, day(x.receivedAt), `${x.student.person.firstName} ${x.student.person.lastName}`, x.student.admissionNumber, cn(x.campusId), x.method, x.reference ?? "", plainMoney(x.amount)]),
      ["", "", "", "", "", "", "Total", plainMoney(d.total)]];
  } else if (report === "outstanding") {
    const d = await outstandingReport({ ...scope, gradeLevelId: p.get("gradeLevelId") || undefined, asOf: new Date() });
    rows = [["Invoice", "Student", "Admission no.", "Campus", "Due date", "Days overdue", "Aging", "Total", "Balance"],
      ...d.rows.map((x) => [x.number, `${x.student.person.firstName} ${x.student.person.lastName}`, x.student.admissionNumber, cn(x.campusId), day(x.dueDate), String(x.overdueDays), x.bucket, plainMoney(x.total), plainMoney(x.balance)]),
      ["", "", "", "", "", "", "", "Total outstanding", plainMoney(d.total)]];
  } else if (report === "discounts") {
    const d = await discountsReport({ ...scope, from, to });
    rows = [["Date", "Invoice", "Student", "Admission no.", "Campus", "Reason", "Amount"],
      ...d.rows.map((x) => [day(x.createdAt), x.invoice.number, `${x.invoice.student.person.firstName} ${x.invoice.student.person.lastName}`, x.invoice.student.admissionNumber, cn(x.invoice.campusId), x.reason, plainMoney(x.amount)]),
      ["", "", "", "", "", "Total", plainMoney(d.total)]];
  } else if (report === "refunds") {
    const d = await refundsReport({ ...scope, from, to });
    rows = [["Date", "Student", "Admission no.", "Method", "Reason", "Amount"],
      ...d.rows.map((x) => [day(x.createdAt), x.student.name, x.student.admissionNumber, x.method, x.reason, plainMoney(x.amount)]),
      ["", "", "", "", "Total", plainMoney(d.total)]];
  } else return new Response("Unknown report", { status: 400 });

  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "report.exported", targetType: "FeeReport", metadata: { report, from: day(from), to: day(to), rows: rows.length - 2 } });
  return new Response(reportCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="fees-${report}-${day(from)}-to-${day(to)}.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
