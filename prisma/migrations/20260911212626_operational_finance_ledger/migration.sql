-- CreateEnum
CREATE TYPE "FinancialAccountType" AS ENUM ('CASH', 'BANK', 'PETTY_CASH', 'GATEWAY');

-- CreateEnum
CREATE TYPE "FinanceTransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "FinancialAccountType" NOT NULL,
    "openingBalance" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_funds" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "fundId" TEXT,
    "type" "FinanceTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_accounts_tenantId_campusId_idx" ON "financial_accounts"("tenantId", "campusId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_accounts_tenantId_code_key" ON "financial_accounts"("tenantId", "code");

-- CreateIndex
CREATE INDEX "finance_categories_tenantId_campusId_idx" ON "finance_categories"("tenantId", "campusId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_campusId_name_kind_key" ON "finance_categories"("campusId", "name", "kind");

-- CreateIndex
CREATE INDEX "financial_funds_tenantId_idx" ON "financial_funds"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_funds_tenantId_code_key" ON "financial_funds"("tenantId", "code");

-- CreateIndex
CREATE INDEX "finance_transactions_tenantId_campusId_occurredAt_idx" ON "finance_transactions"("tenantId", "campusId", "occurredAt");

-- CreateIndex
CREATE INDEX "finance_transactions_accountId_idx" ON "finance_transactions"("accountId");

-- CreateIndex
CREATE INDEX "finance_transactions_fundId_idx" ON "finance_transactions"("fundId");

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "finance_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "financial_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
