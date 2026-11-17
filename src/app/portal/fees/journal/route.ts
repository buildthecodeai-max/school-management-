// FEE-007: GL journal CSV export.
// Each invoice line is mapped to a GL account code via FeeHead.glAccountCode.
// Download only — no UI page needed; linked from the fees page.

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";

export async function GET(req: NextRequest) {
  const ctx = await requirePermission("fee.read");

  const { searchParams } = new URL(req.url);
  const campusId = searchParams.get("campusId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const lines = await prisma.invoiceLine.findMany({
    where: {
      tenantId: ctx.tenantId!,
      invoice: {
        ...(campusId ? { campusId } : {}),
        ...(from ? { issueDate: { gte: new Date(from) } } : {}),
        ...(to ? { issueDate: { lte: new Date(to) } } : {}),
      },
    },
    include: {
      invoice: { include: { student: { include: { person: true } } } },
      feeHead: true,
    },
    orderBy: { invoice: { issueDate: "asc" } },
    take: 5000,
  });

  const header = "Date,Invoice,Student,Description,GL Account,Debit,Credit\r\n";
  const rows = lines
    .map((line) => {
      const inv = line.invoice;
      const student = inv.student.person;
      const glCode = line.feeHead?.glAccountCode ?? "UNASSIGNED";
      const debit = formatMoney(line.amount);
      const credit = "";
      return [
        inv.issueDate.toISOString().split("T")[0],
        inv.number,
        `${student.firstName} ${student.lastName}`,
        line.description.replace(/,/g, ";"),
        glCode,
        debit,
        credit,
      ].join(",");
    })
    .join("\r\n");

  const csv = header + rows;
  const filename = `gl-journal-${new Date().toISOString().split("T")[0]}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
