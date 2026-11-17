import Link from "next/link";
import { requireUser, canAnywhere } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getReport, reportCatalog, type ReportKind } from "@/lib/reports";
import { reportDates } from "@/lib/report-format";

export default async function Reports({ searchParams }: { searchParams: Promise<{ report?: string; campusId?: string; from?: string; to?: string }> }) {
  const ctx = await requireUser();
  const params = await searchParams;
  const available = (Object.keys(reportCatalog) as ReportKind[]).filter(k => canAnywhere(ctx, reportCatalog[k].permission));
  const kind = available.find(k => k === params.report) ?? available[0];
  if (!ctx.tenantId || !kind) return <main className="p-6">No reports available in your current scope.</main>;
  const campuses = await prisma.campus.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true } });
  const { campusScopeFor } = await import("@/lib/rbac");
  const scope = campusScopeFor(ctx, reportCatalog[kind].permission);
  const allowed = campuses.filter(c => scope === null || scope.includes(c.id));
  if (params.campusId && !allowed.some(c => c.id === params.campusId)) return <main className="p-6">Report access denied for this campus.</main>;
  try { reportDates(params.from, params.to); } catch { return <main className="p-6">Invalid date range. <Link href="/portal/reports">Reset filters</Link></main>; }
  const data = await getReport(ctx, kind, params.campusId, params.from, params.to);
  const download = new URLSearchParams({ report: kind, campusId: params.campusId ?? "", from: params.from ?? "", to: params.to ?? "" });
  return <main className="p-6 space-y-6">
    <h1 className="text-2xl font-bold">Report center</h1>
    <nav className="flex gap-4">{available.map(k => <Link key={k} href={`?report=${k}`} className="text-indigo-700 underline">{reportCatalog[k].title}</Link>)}</nav>
    <form className="flex gap-3"><input type="hidden" name="report" value={kind}/><label>Campus <select name="campusId" defaultValue={params.campusId ?? ""} className="border rounded p-2"><option value="">All authorized campuses</option>{allowed.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button className="border rounded px-4">Apply</button></form>
    <h2 className="text-lg font-semibold">{reportCatalog[kind].title}</h2>
    <a href={`/api/portal/reports?${download}&format=xlsx`} className="inline-block rounded border px-4 py-2 text-indigo-700">Download Excel (.xlsx)</a>
    <a href={`/reports/print?${download}`} target="_blank" rel="noopener noreferrer" className="inline-block rounded border px-4 py-2 text-indigo-700">Open print view / Save as PDF</a>
    <form className="flex flex-wrap gap-3 items-end"><input type="hidden" name="report" value={kind}/><input type="hidden" name="campusId" value={params.campusId ?? ""}/><label>From (UTC)<input className="block border rounded p-2" type="date" name="from" defaultValue={params.from}/></label><label>Through (UTC)<input className="block border rounded p-2" type="date" name="to" defaultValue={params.to}/></label><button className="border rounded p-2">Filter dates</button><a className="text-indigo-700 underline p-2" href={`/api/portal/reports?${download}`}>Download CSV</a></form>
    <p className="text-sm text-slate-600">{params.from || "All dates"} through {params.to || "present and future"}. Dates filter finance transaction date, payroll posting date, or enrollment start date, inclusive in UTC. Financial amounts use minor units (100 = 1 currency unit); no currency conversion is applied. Enrollment counts include historical statuses; payroll includes posted runs only.</p>
    <div className="overflow-auto"><table className="min-w-full text-sm"><thead><tr>{data.columns.map(c => <th key={c} className="text-left border-b p-3">{c}</th>)}</tr></thead><tbody>{data.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="border-b p-3">{j === 0 ? campuses.find(c => c.id === cell)?.name ?? cell : cell}</td>)}</tr>)}</tbody></table>{!data.rows.length && <p className="p-4">No records in this scope.</p>}</div>
  </main>;
}
