import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PrintButton } from "./PrintButton";

export default async function PrintInvoicePage({
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

  const student = invoice.student;
  const amountPaid =
    invoice.allocations.reduce((s, a) => s + a.amount, 0) +
    invoice.creditNotes.reduce((s, c) => s + c.amount, 0);
  const overdue = invoice.balance > 0 && invoice.dueDate < new Date();

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
        body { font-family: system-ui, sans-serif; color: #111; background: #f8f9fa; margin: 0; }
        .page { max-width: 720px; margin: 2rem auto; background: white; padding: 48px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 24px; margin-bottom: 24px; }
        .school-name { font-size: 22px; font-weight: 700; color: #1e293b; }
        .school-sub { font-size: 13px; color: #64748b; margin-top: 4px; }
        .doc-title { text-align: right; }
        .doc-title h1 { font-size: 28px; font-weight: 800; color: #4f46e5; margin: 0; letter-spacing: -0.5px; }
        .doc-title .number { font-size: 14px; color: #64748b; margin-top: 4px; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
        .meta-block h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin: 0 0 6px; }
        .meta-block p { margin: 0; font-size: 14px; line-height: 1.6; }
        .status-badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .status-PAID { background: #dcfce7; color: #166534; }
        .status-PARTIAL { background: #fef3c7; color: #92400e; }
        .status-OPEN { background: #dbeafe; color: #1e40af; }
        .status-VOID { background: #f1f5f9; color: #475569; }
        .overdue-banner { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #b91c1c; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        thead tr { border-bottom: 2px solid #e2e8f0; }
        thead th { padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; font-weight: 600; text-align: left; }
        thead th.right { text-align: right; }
        tbody tr { border-bottom: 1px solid #f1f5f9; }
        tbody td { padding: 10px; color: #334155; }
        .totals-table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 8px; border-top: 2px solid #e2e8f0; }
        .totals-table td { padding: 6px 10px; }
        .totals-table td:first-child { color: #64748b; }
        .totals-table td:last-child { text-align: right; font-weight: 500; }
        .grand-total td { font-size: 16px; font-weight: 700; color: #1e293b; padding-top: 10px; }
        .balance-due { margin-top: 24px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; }
        .balance-due .label { font-size: 13px; color: #1d4ed8; font-weight: 600; }
        .balance-due .amount { font-size: 22px; font-weight: 800; color: #1d4ed8; }
        .payments-section { margin-top: 24px; }
        .payments-section h3 { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; margin-bottom: 10px; }
        .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center; }
      `}</style>

      <div className="page">
        <div className="header">
          <div>
            {tenant.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logoUrl} alt={tenant.name} style={{ height: 48, marginBottom: 8 }} />
            )}
            <div className="school-name">{tenant.name}</div>
            <div className="school-sub">
              {campus.name}
              {campus.addressLine && <> · {campus.addressLine}</>}
              {campus.city && <>, {campus.city}</>}
            </div>
          </div>
          <div className="doc-title">
            <h1>INVOICE</h1>
            <div className="number">{invoice.number}</div>
            <div style={{ marginTop: 8 }}>
              <span className={`status-badge status-${invoice.status}`}>{invoice.status}</span>
            </div>
          </div>
        </div>

        {overdue && (
          <div className="overdue-banner">
            ⚠ This invoice is overdue. Payment was due by {invoice.dueDate.toLocaleDateString()}.
          </div>
        )}

        <div className="meta">
          <div className="meta-block">
            <h4>Billed to</h4>
            <p>
              <strong>{student.person.firstName} {student.person.lastName}</strong><br />
              {student.admissionNumber && <>Adm. No: {student.admissionNumber}<br /></>}
              {campus.name}
            </p>
          </div>
          <div className="meta-block">
            <h4>Invoice details</h4>
            <p>
              Invoice No: <strong>{invoice.number}</strong><br />
              Period: {invoice.periodLabel}<br />
              Issue date: {invoice.createdAt.toLocaleDateString()}<br />
              Due date: <strong>{invoice.dueDate.toLocaleDateString()}</strong>
            </p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: "60%" }}>Description</th>
              <th>Tax</th>
              <th className="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description || (l.feeHead?.name ?? "")}</td>
                <td style={{ color: "#94a3b8" }}>{l.taxAmount > 0 ? formatMoney(l.taxAmount) : "—"}</td>
                <td style={{ textAlign: "right", fontWeight: 500 }}>{formatMoney(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="totals-table">
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td>{formatMoney(invoice.subtotal)}</td>
            </tr>
            {invoice.discountTotal > 0 && (
              <tr>
                <td>Discount</td>
                <td style={{ color: "#16a34a" }}>−{formatMoney(invoice.discountTotal)}</td>
              </tr>
            )}
            {invoice.taxTotal > 0 && (
              <tr>
                <td>Tax</td>
                <td>{formatMoney(invoice.taxTotal)}</td>
              </tr>
            )}
            <tr className="grand-total">
              <td>Total</td>
              <td>{formatMoney(invoice.total)}</td>
            </tr>
          </tbody>
        </table>

        {(invoice.allocations.length > 0 || invoice.creditNotes.length > 0) && (
          <div className="payments-section">
            <h3>Payments &amp; adjustments applied</h3>
            <table>
              <tbody>
                {invoice.allocations.map((a) => (
                  <tr key={a.id}>
                    <td>Payment {a.payment.number} · {a.payment.method} · {a.payment.receivedAt.toLocaleDateString()}</td>
                    <td style={{ textAlign: "right", color: "#16a34a", fontWeight: 500 }}>−{formatMoney(a.amount)}</td>
                  </tr>
                ))}
                {invoice.creditNotes.map((c) => (
                  <tr key={c.id}>
                    <td>Credit note · {c.reason}</td>
                    <td style={{ textAlign: "right", color: "#0284c7", fontWeight: 500 }}>−{formatMoney(c.amount)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "1px solid #e2e8f0" }}>
                  <td style={{ fontWeight: 600 }}>Amount paid</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>−{formatMoney(amountPaid)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {invoice.balance > 0 && (
          <div className="balance-due">
            <span className="label">Balance due</span>
            <span className="amount">{formatMoney(invoice.balance)}</span>
          </div>
        )}

        {invoice.balance === 0 && (
          <div style={{ marginTop: 24, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "14px 16px", textAlign: "center", color: "#166534", fontWeight: 600, fontSize: 14 }}>
            ✓ Paid in full
          </div>
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
