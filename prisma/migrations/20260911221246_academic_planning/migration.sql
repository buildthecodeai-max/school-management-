-- CreateTable
CREATE TABLE "syllabus_units" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "targetDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "syllabus_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "planDate" TIMESTAMP(3) NOT NULL,
    "objectives" TEXT NOT NULL,
    "activities" TEXT NOT NULL,
    "resources" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "syllabus_units_tenantId_campusId_idx" ON "syllabus_units"("tenantId", "campusId");

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_units_academicYearId_subjectId_gradeLevelId_sequen_key" ON "syllabus_units"("academicYearId", "subjectId", "gradeLevelId", "sequence");

-- CreateIndex
CREATE INDEX "lesson_plans_tenantId_campusId_planDate_idx" ON "lesson_plans"("tenantId", "campusId", "planDate");

-- CreateIndex
CREATE INDEX "homework_assignments_tenantId_campusId_dueAt_idx" ON "homework_assignments"("tenantId", "campusId", "dueAt");
