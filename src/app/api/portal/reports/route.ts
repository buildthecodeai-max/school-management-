import { requireUser } from "@/lib/rbac";
import { reportCatalog, reportScope, getReport, type ReportKind } from "@/lib/reports";
import { reportCsv, reportDates } from "@/lib/report-format";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { reportWorkbook } from "@/lib/report-workbook";

export async function GET(request: Request) {
  const ctx = await requireUser();
  const params = new URL(request.url).searchParams;
  const kind = params.get("report") ?? "";
  const format = params.get("format") ?? "csv";
  if (!["csv", "xlsx"].includes(format)) return new Response("Unknown format", { status: 400 });
  if (!Object.hasOwn(reportCatalog, kind)) return new Response("Unknown report", { status: 400 });
  const report = kind as ReportKind;
  const campusId = params.get("campusId") || undefined;
  const from = params.get("from") || undefined, to = params.get("to") || undefined;
  try { reportScope(ctx, report, campusId); } catch { return new Response("Access denied", { status: 403 }); }
  try { reportDates(from, to); } catch { return new Response("Invalid date range", { status: 400 }); }
  const campuses = await prisma.campus.findMany({ where: { tenantId: ctx.tenantId! }, select: { id: true, name: true } });
  if (campusId && !campuses.some(c => c.id === campusId)) return new Response("Campus not found", { status: 404 });
  const data = await getReport(ctx, report, campusId, from, to);
  const rows = data.rows.map(row => [campuses.find(c => c.id === row[0])?.name ?? row[0], ...row.slice(1)]);
  const workbook = format === "xlsx" ? await reportWorkbook(reportCatalog[report].title, data.columns, rows, {
    Campus: campuses.find(c => c.id === campusId)?.name ?? "All authorized campuses",
    "From (UTC)": from ?? "All", "Through (UTC)": to ?? "All",
    "Date basis": report === "finance" ? "Transaction date" : report === "payroll" ? "Posting date; posted runs only" : "Enrollment start date; all statuses",
  }) : null;
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "report.exported", targetType: "Report", campusId, metadata: { report, format, from: from ?? null, to: to ?? null, rows: rows.length } });
  if (workbook) return new Response(workbook, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${report}-report.xlsx"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
  return new Response(reportCsv([[reportCatalog[report].title], ["From (UTC)", from ?? "All", "Through (UTC)", to ?? "All"], data.columns, ...rows]), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${report}-report.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
