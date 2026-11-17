// FEE-007: GL journal CSV download route.
// Returns the GL journal as a downloadable CSV file.
// Uses the same generation logic as exportGLJournal() server action
// but streams it with Content-Disposition so the browser downloads it.

import { NextRequest, NextResponse } from "next/server";
import { requireUser, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  let ctx: Awaited<ReturnType<typeof requireUser>>;
  try {
    ctx = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const campusId = searchParams.get("campusId") ?? "";
  const fromDate = searchParams.get("from") ?? "";
  const toDate = searchParams.get("to") ?? "";

  if (!campusId || !fromDate || !toDate) {
    return NextResponse.json({ error: "campusId, from, and to are required." }, { status: 400 });
  }
  if (!canForCampus(ctx, "fee.read", campusId)) {
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  }

  const from = new Date(fromDate);
  const to = new Date(toDate);

  const invoiceLines = await prisma.invoiceLine.findMany({
    where: {
      invoice: {
        tenantId: ctx.tenantId!,
        campusId,
        issueDate: { gte: from, lte: to },
      },
    },
    include: { feeHead: true },
  });

  const byHead = new Map<string, { head: NonNullable<typeof invoiceLines[0]["feeHead"]>; debitCents: number }>();
  for (const line of invoiceLines) {
    if (!line.feeHeadId || !line.feeHead) continue;
    const existing = byHead.get(line.feeHeadId);
    if (existing) {
      existing.debitCents += line.amount;
    } else {
      byHead.set(line.feeHeadId, { head: line.feeHead, debitCents: line.amount });
    }
  }

  const rows = ["date,account_code,account_name,debit_cents,credit_cents,description"];
  for (const { head, debitCents } of byHead.values()) {
    const glCode = head.glAccountCode ?? head.id.slice(0, 8).toUpperCase();
    rows.push(`${toDate},${glCode},"${head.name}",${debitCents},0,"Fees revenue ${fromDate}–${toDate}"`);
    rows.push(`${toDate},AR-${glCode},"Accounts Receivable – ${head.name}",0,${debitCents},"AR contra"`);
  }

  const csv = rows.join("\n");
  const filename = `gl-journal-${fromDate}-to-${toDate}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
