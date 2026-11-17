-- CreateTable
CREATE TABLE "teacher_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "substitute_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "timetableSlotId" TEXT NOT NULL,
    "absentStaffId" TEXT NOT NULL,
    "substituteStaffId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "substitute_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_assignments_tenantId_campusId_idx" ON "teacher_assignments"("tenantId", "campusId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_assignments_staffId_subjectId_sectionId_academicYea_key" ON "teacher_assignments"("staffId", "subjectId", "sectionId", "academicYearId");

-- CreateIndex
CREATE INDEX "teacher_documents_tenantId_staffId_idx" ON "teacher_documents"("tenantId", "staffId");

-- CreateIndex
CREATE INDEX "substitute_assignments_tenantId_campusId_date_idx" ON "substitute_assignments"("tenantId", "campusId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "substitute_assignments_timetableSlotId_date_key" ON "substitute_assignments"("timetableSlotId", "date");

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_documents" ADD CONSTRAINT "teacher_documents_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitute_assignments" ADD CONSTRAINT "substitute_assignments_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitute_assignments" ADD CONSTRAINT "substitute_assignments_timetableSlotId_fkey" FOREIGN KEY ("timetableSlotId") REFERENCES "timetable_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitute_assignments" ADD CONSTRAINT "substitute_assignments_absentStaffId_fkey" FOREIGN KEY ("absentStaffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitute_assignments" ADD CONSTRAINT "substitute_assignments_substituteStaffId_fkey" FOREIGN KEY ("substituteStaffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
