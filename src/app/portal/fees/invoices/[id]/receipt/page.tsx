import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PrintButton } from "../print/PrintButton";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePermission("fee.read");
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: ctx.tenantId! },
    include: {
      student: { include: { person: true } },
      lines: { include: { feeHead: true } },
      allocations: { include: { payment: true }, orderBy: { createdAt: "asc" } },
      creditNotes: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!invoice) notFound();

  const allowed = allowedCampusIds(ctx, "fee.read");
  if (allowed && !allowed.includes(invoice.campusId)) notFound();

  const [campus, tenant] = await Promise.all([
    prisma.campus.findUnique({ where: { id: invoice.campusId } }),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId! } }),
  ]);
  if (!campus || !tenant) notFound();

  if (invoice.allocations.length === 0 && invoice.creditNotes.length === 0) {
    return (
      <div style={{ maxWidth: 600, margin: "4rem auto", textAlign: "center", fontFamily: "system-ui, sans-serif", color: "#64748b" }}>
        <p style={{ fontSize: 18, fontWeight: 600, color: "#334155", marginBottom: 8 }}>No payments recorded</p>
        <p>There are no payments or adjustments to show a receipt for on invoice {invoice.number}.</p>
        <a href={`/portal/fees/invoices/${id}`} style={{ color: "#4f46e5", fontSize: 14 }}>← Back to invoice</a>
      </div>
    );
  }

  const student = invoice.student;
  const totalPaid = invoice.allocations.reduce((s, a) => s + a.amount, 0);
  const totalAdjusted = invoice.creditNotes.reduce((s, c) => s + c.amount, 0);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
        body { font-family: system-ui, sans-serif; color: #111; background: #f8f9fa; margin: 0; }
        .page { max-width: 680px; margin: 2rem auto; background: white; padding: 48px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 24px; margin-bottom: 24px; }
        .school-name { font-size: 20px; font-weight: 700; color: #1e293b; }
        .school-sub { font-size: 13px; color: #64748b; margin-top: 4px; }
        .doc-title { text-align: right; }
        .doc-title h1 { font-size: 26px; font-weight: 800; color: #059669; margin: 0; letter-spacing: -0.5px; }
        .doc-title .number { font-size: 13px; color: #64748b; margin-top: 4px; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
        .meta-block h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin: 0 0 6px; }
        .meta-block p { margin: 0; font-size: 14px; line-height: 1.6; }
        .section-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; margin: 0 0 10px; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px; }
        thead tr { border-bottom: 2px solid #e2e8f0; }
        thead th { padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; font-weight: 600; text-align: left; }
        thead th.right { text-align: right; }
        tbody tr { border-bottom: 1px solid #f1f5f9; }
        tbody td { padding: 10px; color: #334155; }
        .summary-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px 24px; margin-top: 24px; }
        .summary-row { display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; }
        .summary-row.total { font-size: 16px; font-weight: 700; color: #166534; border-top: 1px solid #bbf7d0; margin-top: 8px; padding-top: 12px; }
        .paid-stamp { text-align: center; margin-top: 24px; padding: 14px; border: 3px solid #16a34a; border-radius: 8px; color: #16a34a; font-size: 22px; font-weight: 800; letter-spacing: 2px; opacity: 0.8; }
        .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center; }
      `}</style>

      <div className="page">
        <div className="header">
          <div>
            {tenant.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logoUrl} alt={tenant.name} style={{ height: 44, marginBottom: 8 }} />
            )}
            <div className="school-name">{tenant.name}</div>
            <div className="school-sub">
              {campus.name}
              {campus.addressLine && <> · {campus.addressLine}</>}
              {campus.city && <>, {campus.city}</>}
            </div>
          </div>
          <div className="doc-title">
            <h1>RECEIPT</h1>
            <div className="number">For invoice {invoice.number}</div>
          </div>
        </div>

        <div className="meta">
          <div className="meta-block">
            <h4>Received from</h4>
            <p>
              <strong>{student.person.firstName} {student.person.lastName}</strong><br />
              {student.admissionNumber && <>Adm. No: {student.admissionNumber}<br /></>}
              {campus.name}
            </p>
          </div>
          <div className="meta-block">
            <h4>Invoice reference</h4>
            <p>
              Invoice No: <strong>{invoice.number}</strong><br />
              Period: {invoice.periodLabel}<br />
              Invoice total: <strong>{formatMoney(invoice.total)}</strong>
            </p>
          </div>
        </div>

        {invoice.allocations.length > 0 && (
          <>
            <p className="section-title">Payments</p>
            <table>
              <thead>
                <tr>
                  <th>Receipt No.</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.allocations.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.payment.number}</td>
                    <td>{a.payment.receivedAt.toLocaleDateString()}</td>
                    <td>{a.payment.method}</td>
                    <td style={{ color: "#94a3b8" }}>{a.payment.reference || "—"}</td>
                    <td style={{ textAlign: "right", color: "#059669", fontWeight: 600 }}>{formatMoney(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {invoice.creditNotes.length > 0 && (
          <>
            <p className="section-title">Credit notes &amp; adjustments</p>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reason</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.creditNotes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.createdAt.toLocaleDateString()}</td>
                    <td>{c.reason}</td>
                    <td style={{ textAlign: "right", color: "#0284c7", fontWeight: 600 }}>{formatMoney(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="summary-box">
          <div className="summary-row">
            <span>Invoice total</span>
            <span>{formatMoney(invoice.total)}</span>
          </div>
          {totalPaid > 0 && (
            <div className="summary-row">
              <span>Cash / transfers received</span>
              <span style={{ color: "#059669" }}>−{formatMoney(totalPaid)}</span>
            </div>
          )}
          {totalAdjusted > 0 && (
            <div className="summary-row">
              <span>Credits &amp; adjustments</span>
              <span style={{ color: "#0284c7" }}>−{formatMoney(totalAdjusted)}</span>
            </div>
          )}
          <div className="summary-row total">
            <span>Remaining balance</span>
            <span>{formatMoney(invoice.balance)}</span>
          </div>
        </div>

        {invoice.balance === 0 && (
          <div className="paid-stamp">PAID IN FULL</div>
        )}

        <div className="footer">
          {tenant.name} · {campus.name}
          {campus.city && ` · ${campus.city}`}
          {" "}· Generated {new Date().toLocaleDateString()}
        </div>
      </div>

      <PrintButton />
    </>
  );
}
