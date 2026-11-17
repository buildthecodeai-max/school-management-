-- CreateTable
CREATE TABLE "certificate_issues" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "certificateType" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedByUserId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "certificate_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_id_cards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedByUserId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "student_id_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "certificate_issues_tenantId_studentId_idx" ON "certificate_issues"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_issues_tenantId_number_key" ON "certificate_issues"("tenantId", "number");

-- CreateIndex
CREATE INDEX "student_id_cards_tenantId_studentId_idx" ON "student_id_cards"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "student_id_cards_tenantId_cardNumber_key" ON "student_id_cards"("tenantId", "cardNumber");

-- CreateIndex
CREATE UNIQUE INDEX "student_id_cards_studentId_academicYearId_key" ON "student_id_cards"("studentId", "academicYearId");
