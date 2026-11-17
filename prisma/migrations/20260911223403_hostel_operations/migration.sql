-- CreateTable
CREATE TABLE "hostels" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genderPolicy" TEXT NOT NULL DEFAULT 'ANY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_rooms" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "hostel_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "assignedByUserId" TEXT NOT NULL,

    CONSTRAINT "hostel_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hostels_tenantId_campusId_idx" ON "hostels"("tenantId", "campusId");

-- CreateIndex
CREATE UNIQUE INDEX "hostels_campusId_name_key" ON "hostels"("campusId", "name");

-- CreateIndex
CREATE INDEX "hostel_rooms_tenantId_hostelId_idx" ON "hostel_rooms"("tenantId", "hostelId");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_rooms_hostelId_code_key" ON "hostel_rooms"("hostelId", "code");

-- CreateIndex
CREATE INDEX "hostel_assignments_tenantId_studentId_idx" ON "hostel_assignments"("tenantId", "studentId");

-- AddForeignKey
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "hostels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_assignments" ADD CONSTRAINT "hostel_assignments_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "hostel_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_assignments" ADD CONSTRAINT "hostel_assignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
