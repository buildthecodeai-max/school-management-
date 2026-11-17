import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getReport, reportCatalog, reportScope, type ReportKind } from "@/lib/reports";
import { reportDates } from "@/lib/report-format";
import { PrintButton } from "@/app/portal/fees/invoices/[id]/print/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Print report", robots: { index: false, follow: false } };

export default async function PrintReport({ searchParams }: {
  searchParams: Promise<{ report?: string; campusId?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  if (!params.report || !Object.hasOwn(reportCatalog, params.report)) notFound();
  const kind = params.report as ReportKind;
  const ctx = await requirePermission(reportCatalog[kind].permission);
  try {
    reportScope(ctx, kind, params.campusId || undefined);
    reportDates(params.from, params.to);
  } catch { notFound(); }
  const [tenant, campuses] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId! }, select: { name: true } }),
    prisma.campus.findMany({ where: { tenantId: ctx.tenantId! }, select: { id: true, name: true } }),
  ]);
  if (params.campusId && !campuses.some(c => c.id === params.campusId)) notFound();
  const report = await getReport(ctx, kind, params.campusId || undefined, params.from, params.to);
  const campusLabel = params.campusId ? campuses.find(c => c.id === params.campusId)!.name : "All authorized campuses";
  const basis = { finance: "Transaction date", payroll: "Payroll posting date (posted runs only)", enrollment: "Enrollment start date (all statuses)" }[kind];
  return <main className="report-document">
    <style>{`
      body { background: white; color: #172033; }
      .report-document { max-width: 1100px; margin: 32px auto; padding: 24px; font-family: Arial, sans-serif; }
      .report-document h1 { font-size: 26px; font-weight: 700; margin: 8px 0; }
      .report-document p { margin: 6px 0; }
      .report-document table { width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 12px; }
      .report-document th, .report-document td { text-align: left; padding: 10px; border-bottom: 1px solid #cbd5e1; overflow-wrap: anywhere; }
      .report-document th { background: #eef2f7; }
      @page { size: A4 landscape; margin: 15mm; }
      @media print {
        .no-print { display: none !important; }
        .report-document { margin: 0; padding: 0; max-width: none; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
      }
    `}</style>
    <p>{tenant?.name}</p>
    <h1>{reportCatalog[kind].title}</h1>
    <p>{campusLabel}</p>
    <p>{params.from || "Unbounded start"} through {params.to || "Unbounded end"} (inclusive UTC dates)</p>
    <p>{basis}</p>
    <p>Generated {new Date().toISOString()}</p>
    <table><thead><tr>{report.columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
      <tbody>{report.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{j === 0 ? campuses.find(c => c.id === cell)?.name ?? cell : cell}</td>)}</tr>)}</tbody>
    </table>
    {!report.rows.length && <p>No records match the selected filters.</p>}
    {kind !== "enrollment" && <p>Amounts are in minor units (100 = 1 currency unit). No currency conversion is applied.</p>}
    <PrintButton />
  </main>;
}
