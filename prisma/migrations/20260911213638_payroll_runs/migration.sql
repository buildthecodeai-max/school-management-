-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "processedByUserId" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "grossPay" INTEGER NOT NULL,
    "deductions" INTEGER NOT NULL DEFAULT 0,
    "netPay" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_loans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "principal" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "installmentAmount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_advances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "recovered" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_advances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_runs_tenantId_campusId_idx" ON "payroll_runs"("tenantId", "campusId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_campusId_periodLabel_key" ON "payroll_runs"("campusId", "periodLabel");

-- CreateIndex
CREATE INDEX "payslips_tenantId_staffId_idx" ON "payslips"("tenantId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_payrollRunId_staffId_key" ON "payslips"("payrollRunId", "staffId");

-- CreateIndex
CREATE INDEX "staff_loans_tenantId_staffId_idx" ON "staff_loans"("tenantId", "staffId");

-- CreateIndex
CREATE INDEX "staff_advances_tenantId_staffId_idx" ON "staff_advances"("tenantId", "staffId");

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_loans" ADD CONSTRAINT "staff_loans_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_loans" ADD CONSTRAINT "staff_loans_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_advances" ADD CONSTRAINT "staff_advances_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_advances" ADD CONSTRAINT "staff_advances_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
