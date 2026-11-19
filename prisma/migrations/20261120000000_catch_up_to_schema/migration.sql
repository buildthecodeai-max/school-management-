-- Catch-up migration: brings a database built from the earlier migrations up to the current schema.
-- Generated with: prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma
-- Covers recruitment, gateway webhooks, languages, offboarding, MFA sessions, attendance amendments,
-- bank-line constraints, library/inventory/transport cascades and later changes that were applied with db push.

-- CreateEnum
CREATE TYPE "JobOpeningStatus" AS ENUM ('OPEN', 'ON_HOLD', 'CLOSED', 'FILLED');

-- CreateEnum
CREATE TYPE "ApplicantStage" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- AlterEnum
ALTER TYPE "EnrollmentStatus" ADD VALUE 'SUSPENDED';

-- DropForeignKey
ALTER TABLE "asset_assignments" DROP CONSTRAINT "asset_assignments_assignedToUserId_fkey";

-- DropForeignKey
ALTER TABLE "asset_assignments" DROP CONSTRAINT "asset_assignments_itemId_fkey";

-- DropForeignKey
ALTER TABLE "inventory_items" DROP CONSTRAINT "inventory_items_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "library_circulations" DROP CONSTRAINT "library_circulations_borrowerUserId_fkey";

-- DropForeignKey
ALTER TABLE "library_circulations" DROP CONSTRAINT "library_circulations_copyId_fkey";

-- DropForeignKey
ALTER TABLE "library_items" DROP CONSTRAINT "library_items_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "library_reservations" DROP CONSTRAINT "library_reservations_itemId_fkey";

-- DropForeignKey
ALTER TABLE "library_reservations" DROP CONSTRAINT "library_reservations_reservedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_lines" DROP CONSTRAINT "purchase_order_lines_itemId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "requisition_lines" DROP CONSTRAINT "requisition_lines_itemId_fkey";

-- DropForeignKey
ALTER TABLE "trip_attendances" DROP CONSTRAINT "trip_attendances_routeId_fkey";

-- DropIndex
DROP INDEX "message_templates_tenantId_code_key";

-- AlterTable
ALTER TABLE "bank_statement_lines" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "matchedAt" TIMESTAMP(3),
ADD COLUMN     "matchedByUserId" TEXT,
ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "campuses" ADD COLUMN     "logoUrl" TEXT;

-- AlterTable
ALTER TABLE "fee_structures" ADD COLUMN     "effectiveTo" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "library_circulations" ADD COLUMN     "renewCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "message_templates" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "mfaVerified" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "dataExportedAt" TIMESTAMP(3),
ADD COLUMN     "deletionScheduledAt" TIMESTAMP(3),
ADD COLUMN     "deletionScheduledById" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" TEXT,
ADD COLUMN     "passwordResetToken" TEXT,
ADD COLUMN     "passwordResetTokenExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "staff_attendance_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "checkInTime" TEXT,
    "checkOutTime" TEXT,
    "note" TEXT,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_amendments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromCodeId" TEXT,
    "toCodeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plan_installments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "payment_plan_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_gateway_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'generic',
    "webhookSecret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateway_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_webhook_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "paymentId" TEXT,
    "error" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_openings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "positionId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "status" "JobOpeningStatus" NOT NULL DEFAULT 'OPEN',
    "closesAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applicants" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "source" TEXT,
    "coverNote" TEXT,
    "rating" INTEGER,
    "stage" "ApplicantStage" NOT NULL DEFAULT 'APPLIED',
    "staffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_applicants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applicant_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "fromStage" "ApplicantStage",
    "toStage" "ApplicantStage" NOT NULL,
    "note" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_applicant_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_attendance_records_tenantId_idx" ON "staff_attendance_records"("tenantId");

-- CreateIndex
CREATE INDEX "staff_attendance_records_campusId_idx" ON "staff_attendance_records"("campusId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_records_staffId_date_key" ON "staff_attendance_records"("staffId", "date");

-- CreateIndex
CREATE INDEX "attendance_amendments_tenantId_idx" ON "attendance_amendments"("tenantId");

-- CreateIndex
CREATE INDEX "attendance_amendments_sessionId_idx" ON "attendance_amendments"("sessionId");

-- CreateIndex
CREATE INDEX "payment_plans_tenantId_idx" ON "payment_plans"("tenantId");

-- CreateIndex
CREATE INDEX "payment_plans_studentId_idx" ON "payment_plans"("studentId");

-- CreateIndex
CREATE INDEX "payment_plans_invoiceId_idx" ON "payment_plans"("invoiceId");

-- CreateIndex
CREATE INDEX "payment_plan_installments_planId_idx" ON "payment_plan_installments"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_configs_tenantId_provider_key" ON "payment_gateway_configs"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "gateway_webhook_events_tenantId_receivedAt_idx" ON "gateway_webhook_events"("tenantId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_webhook_events_tenantId_provider_eventId_key" ON "gateway_webhook_events"("tenantId", "provider", "eventId");

-- CreateIndex
CREATE INDEX "job_openings_tenantId_campusId_idx" ON "job_openings"("tenantId", "campusId");

-- CreateIndex
CREATE INDEX "job_applicants_tenantId_openingId_idx" ON "job_applicants"("tenantId", "openingId");

-- CreateIndex
CREATE UNIQUE INDEX "job_applicants_openingId_email_key" ON "job_applicants"("openingId", "email");

-- CreateIndex
CREATE INDEX "job_applicant_events_applicantId_idx" ON "job_applicant_events"("applicantId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_tenantId_campusId_dedupeKey_key" ON "bank_statement_lines"("tenantId", "campusId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_tenantId_matchedPaymentId_key" ON "bank_statement_lines"("tenantId", "matchedPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_tenantId_code_locale_key" ON "message_templates"("tenantId", "code", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "users_passwordResetToken_key" ON "users"("passwordResetToken");

-- AddForeignKey
ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "staff_attendance_records_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_amendments" ADD CONSTRAINT "attendance_amendments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plan_installments" ADD CONSTRAINT "payment_plan_installments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "payment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "library_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_circulations" ADD CONSTRAINT "library_circulations_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "library_copies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_circulations" ADD CONSTRAINT "library_circulations_borrowerUserId_fkey" FOREIGN KEY ("borrowerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_reservedByUserId_fkey" FOREIGN KEY ("reservedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_attendances" ADD CONSTRAINT "trip_attendances_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "inventory_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applicants" ADD CONSTRAINT "job_applicants_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "job_openings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applicant_events" ADD CONSTRAINT "job_applicant_events_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "job_applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

