-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CampusStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('PLATFORM', 'ORG', 'CAMPUS');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('APPLICANT', 'ENROLLED', 'WITHDRAWN', 'GRADUATED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('MOTHER', 'FATHER', 'GUARDIAN', 'GRANDPARENT', 'SIBLING', 'OTHER');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'WITHDRAWN', 'TRANSFERRED', 'TRANSFERRED_OUT', 'TRANSFERRED_IN', 'ALUMNI');

-- CreateEnum
CREATE TYPE "AttendanceCategory" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'LEAVE', 'REMOTE');

-- CreateEnum
CREATE TYPE "AttendanceSessionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'LOCKED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'READ');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('ATTENDANCE', 'FINANCE', 'ACADEMICS', 'ADMISSIONS', 'ANNOUNCEMENT', 'SECURITY', 'BILLING');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ApplicationSource" AS ENUM ('WEBSITE', 'WALK_IN', 'REFERRAL', 'STAFF', 'API');

-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('INQUIRY', 'APPLICATION', 'REVIEW', 'ASSESSMENT', 'INTERVIEW', 'DECISION', 'OFFER', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WAITLISTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ChecklistItemType" AS ENUM ('DOCUMENT', 'PAYMENT', 'FORM', 'CONSENT');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('ISSUED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "FeeCategory" AS ENUM ('TUITION', 'TRANSPORT', 'MEALS', 'LAB', 'ACTIVITY', 'EXAM', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK', 'CARD', 'WALLET', 'CHEQUE', 'GATEWAY', 'IMPORT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CONFIRMED', 'PENDING', 'REVERSED');

-- CreateEnum
CREATE TYPE "AssessmentPlanStatus" AS ENUM ('OPEN', 'SUBMITTED', 'APPROVED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "MarkStatus" AS ENUM ('NORMAL', 'ABSENT', 'EXEMPT');

-- CreateEnum
CREATE TYPE "ResultVersionStatus" AS ENUM ('PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ApiClientStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "WebhookEndpointStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('VALID', 'EXPIRING_SOON', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'MANUAL', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TimetableVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LibraryCopyStatus" AS ENUM ('AVAILABLE', 'ISSUED', 'LOST', 'DAMAGED');

-- CreateEnum
CREATE TYPE "LibraryTransactionType" AS ENUM ('ISSUE', 'RETURN', 'RENEW', 'LOST');

-- CreateEnum
CREATE TYPE "TripDirection" AS ENUM ('MORNING', 'AFTERNOON', 'OTHER');

-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'FULFILLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SafeguardingCaseStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'CLOSED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "primaryColor" TEXT NOT NULL DEFAULT '#4f46e5',
    "logoUrl" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceMonthly" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "maxStudents" INTEGER NOT NULL DEFAULT 100,
    "maxCampuses" INTEGER NOT NULL DEFAULT 1,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "seatsInUse" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campuses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "CampusStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "addressLine" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campus_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campus_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "personId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "isPlatformStaff" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "passwordChangedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "impersonatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "scopeType" "ScopeType" NOT NULL DEFAULT 'ORG',
    "campusId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender" NOT NULL DEFAULT 'UNDISCLOSED',
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "admissionNumber" TEXT NOT NULL,
    "status" "StudentStatus" NOT NULL DEFAULT 'ENROLLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "occupation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_relationships" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "relationship" "RelationshipType" NOT NULL DEFAULT 'GUARDIAN',
    "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,
    "financiallyResponsible" BOOLEAN NOT NULL DEFAULT false,
    "canPickup" BOOLEAN NOT NULL DEFAULT true,
    "receivesNotifications" BOOLEAN NOT NULL DEFAULT true,
    "custodyNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_levels" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "grade_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 40,
    "homeroomStaffId" TEXT,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "rollNumber" INTEGER,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_codes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "AttendanceCategory" NOT NULL,
    "countsAsPresent" BOOLEAN NOT NULL DEFAULT false,
    "notifyGuardian" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attendance_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "period" TEXT,
    "status" "AttendanceSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "takenByStaffId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL DEFAULT 'ANNOUNCEMENT',
    "dataClassification" TEXT NOT NULL DEFAULT 'INTERNAL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'INAPP',
    "status" "MessageStatus" NOT NULL DEFAULT 'SENT',
    "relatedType" TEXT,
    "relatedId" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quietHoursStartHour" INTEGER,
    "quietHoursEndHour" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "provider" TEXT NOT NULL,
    "recipient" TEXT,
    "status" "DeliveryStatus" NOT NULL,
    "providerRef" TEXT,
    "error" TEXT,
    "correlationId" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "scopeType" "ScopeType" NOT NULL DEFAULT 'ORG',
    "campusId" TEXT,
    "correlationId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainKey" TEXT,
    "seq" INTEGER,
    "prevHash" TEXT,
    "entryHash" TEXT,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "applicantPersonId" TEXT NOT NULL,
    "gradeLevelId" TEXT,
    "source" "ApplicationSource" NOT NULL DEFAULT 'STAFF',
    "stage" "ApplicationStage" NOT NULL DEFAULT 'INQUIRY',
    "ownerUserId" TEXT,
    "priorSchool" TEXT,
    "notes" TEXT,
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "guardianName" TEXT,
    "guardianEmail" TEXT,
    "guardianPhone" TEXT,
    "guardianRelationship" "RelationshipType",
    "duplicateReviewed" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_stage_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStage" "ApplicationStage",
    "toStage" "ApplicationStage" NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_stage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "ChecklistItemType" NOT NULL DEFAULT 'DOCUMENT',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "notes" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "interviewerUserId" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "score" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "OfferStatus" NOT NULL DEFAULT 'ISSUED',
    "depositAmount" INTEGER NOT NULL DEFAULT 0,
    "depositPaid" BOOLEAN NOT NULL DEFAULT false,
    "deadline" TIMESTAMP(3),
    "terms" TEXT,
    "approvedByUserId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_conversions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "guardianId" TEXT,
    "guardianUserId" TEXT,
    "convertedByUserId" TEXT,
    "convertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_heads" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FeeCategory" NOT NULL DEFAULT 'OTHER',
    "taxRatePct" INTEGER NOT NULL DEFAULT 0,
    "glAccountCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "gradeLevelId" TEXT,
    "academicYearId" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structure_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "feeHeadId" TEXT NOT NULL,
    "label" TEXT,
    "amount" INTEGER NOT NULL,
    "installmentCount" INTEGER NOT NULL DEFAULT 1,
    "installmentPlan" JSONB,

    CONSTRAINT "fee_structure_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_fee_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeStructureId" TEXT NOT NULL,
    "discountPct" INTEGER NOT NULL DEFAULT 0,
    "discountReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_fee_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeStructureId" TEXT,
    "number" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "discountTotal" INTEGER NOT NULL DEFAULT 0,
    "taxTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "sourceRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "feeHeadId" TEXT,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "amount" INTEGER NOT NULL,
    "reference" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "collectedByUserId" TEXT,
    "note" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK',
    "reason" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "feeStructureId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "invoiceCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_scales" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "grade_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_bands" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scaleId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "minPercent" DOUBLE PRECISION NOT NULL,
    "gradePoint" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPass" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "grade_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gradeScaleId" TEXT NOT NULL,
    "status" "AssessmentPlanStatus" NOT NULL DEFAULT 'OPEN',
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_components" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "maxMarks" INTEGER NOT NULL,

    CONSTRAINT "assessment_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_subjects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherStaffId" TEXT,

    CONSTRAINT "plan_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mark_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "marks" DOUBLE PRECISION,
    "status" "MarkStatus" NOT NULL DEFAULT 'NORMAL',
    "enteredByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mark_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_versions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ResultVersionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "reason" TEXT,
    "publishedByUserId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_results" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resultVersionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "overallPercent" DOUBLE PRECISION NOT NULL,
    "overallGrade" TEXT NOT NULL,
    "rank" INTEGER,
    "passed" BOOLEAN NOT NULL DEFAULT true,
    "remark" TEXT,
    "conductRemark" TEXT,

    CONSTRAINT "student_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_result_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentResultId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "grade" TEXT NOT NULL,

    CONSTRAINT "student_result_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_clients" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "status" "ApiClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "api_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "apiClientId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "status" "WebhookEndpointStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL,
    "httpStatus" INTEGER,
    "error" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "correlationId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "reference" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" "DocumentStatus" NOT NULL DEFAULT 'VALID',
    "fileUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_schedules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "assessmentPlanId" TEXT,
    "name" TEXT NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "roomId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_invigilators" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examScheduleId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "exam_invigilators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examScheduleId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "seatNumber" TEXT NOT NULL,

    CONSTRAINT "seat_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competencies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_competency_ratings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentResultId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,

    CONSTRAINT "student_competency_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL DEFAULT 'ANNOUNCEMENT',
    "dataClassification" TEXT NOT NULL DEFAULT 'INTERNAL',
    "titleTemplate" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_versions" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "limits" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedPaymentId" TEXT,
    "importBatchId" TEXT,

    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "daysPerYear" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "appliesTo" TEXT NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "academicYearId" TEXT,
    "totalDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "staffId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 30,
    "roomType" TEXT NOT NULL DEFAULT 'CLASSROOM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_versions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "termId" TEXT,
    "name" TEXT NOT NULL,
    "status" "TimetableVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "staffId" TEXT,
    "roomId" TEXT,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "requestType" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "note" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "contractType" TEXT NOT NULL DEFAULT 'PERMANENT',
    "salary" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_inputs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "grossPay" INTEGER NOT NULL,
    "deductions" JSONB NOT NULL,
    "netPay" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "separation_checklists" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "lastWorkDay" TIMESTAMP(3) NOT NULL,
    "items" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "separation_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "library_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_authors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "library_authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "isbn" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_copies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "status" "LibraryCopyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_copies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_circulations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "copyId" TEXT NOT NULL,
    "borrowerUserId" TEXT NOT NULL,
    "type" "LibraryTransactionType" NOT NULL,
    "dueDate" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "fineAmount" INTEGER NOT NULL DEFAULT 0,
    "finePaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_circulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_reservations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "reservedByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "regNumber" TEXT NOT NULL,
    "model" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "driverStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stops" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "boardingStopId" TEXT,
    "alightingStopId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_attendances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "tripDate" TIMESTAMP(3) NOT NULL,
    "direction" "TripDirection" NOT NULL DEFAULT 'MORNING',
    "records" JSONB NOT NULL,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "inventory_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "supplierId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "reorderThreshold" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_ledger_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "RequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalRequestId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisition_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "requisition_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitCost" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "assignedToUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "allergies" TEXT,
    "conditions" TEXT,
    "emergencyContact" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_incidents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "healthRecordId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reportedByUserId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safeguarding_cases" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SafeguardingCaseStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safeguarding_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safeguarding_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safeguarding_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "org_settings_tenantId_idx" ON "org_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "org_settings_tenantId_key_key" ON "org_settings"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenantId_key" ON "subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "campuses_tenantId_idx" ON "campuses"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "campuses_tenantId_code_key" ON "campuses"("tenantId", "code");

-- CreateIndex
CREATE INDEX "campus_settings_tenantId_idx" ON "campus_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "campus_settings_campusId_key_key" ON "campus_settings"("campusId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "users_personId_key" ON "users"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "roles_tenantId_idx" ON "roles"("tenantId");

-- CreateIndex
CREATE INDEX "role_assignments_userId_idx" ON "role_assignments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "role_assignments_userId_roleId_scopeType_campusId_key" ON "role_assignments"("userId", "roleId", "scopeType", "campusId");

-- CreateIndex
CREATE INDEX "people_tenantId_idx" ON "people"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "students_personId_key" ON "students"("personId");

-- CreateIndex
CREATE INDEX "students_tenantId_idx" ON "students"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenantId_admissionNumber_key" ON "students"("tenantId", "admissionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_personId_key" ON "guardians"("personId");

-- CreateIndex
CREATE INDEX "guardians_tenantId_idx" ON "guardians"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_personId_key" ON "staff"("personId");

-- CreateIndex
CREATE INDEX "staff_tenantId_idx" ON "staff"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_tenantId_employeeNumber_key" ON "staff"("tenantId", "employeeNumber");

-- CreateIndex
CREATE INDEX "guardian_relationships_tenantId_idx" ON "guardian_relationships"("tenantId");

-- CreateIndex
CREATE INDEX "guardian_relationships_studentId_idx" ON "guardian_relationships"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_relationships_guardianId_studentId_key" ON "guardian_relationships"("guardianId", "studentId");

-- CreateIndex
CREATE INDEX "academic_years_tenantId_idx" ON "academic_years"("tenantId");

-- CreateIndex
CREATE INDEX "academic_years_campusId_idx" ON "academic_years"("campusId");

-- CreateIndex
CREATE INDEX "terms_tenantId_idx" ON "terms"("tenantId");

-- CreateIndex
CREATE INDEX "grade_levels_tenantId_idx" ON "grade_levels"("tenantId");

-- CreateIndex
CREATE INDEX "grade_levels_campusId_idx" ON "grade_levels"("campusId");

-- CreateIndex
CREATE INDEX "sections_tenantId_idx" ON "sections"("tenantId");

-- CreateIndex
CREATE INDEX "sections_campusId_idx" ON "sections"("campusId");

-- CreateIndex
CREATE INDEX "enrollments_tenantId_idx" ON "enrollments"("tenantId");

-- CreateIndex
CREATE INDEX "enrollments_studentId_idx" ON "enrollments"("studentId");

-- CreateIndex
CREATE INDEX "enrollments_sectionId_idx" ON "enrollments"("sectionId");

-- CreateIndex
CREATE INDEX "attendance_codes_tenantId_idx" ON "attendance_codes"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_codes_tenantId_code_key" ON "attendance_codes"("tenantId", "code");

-- CreateIndex
CREATE INDEX "attendance_sessions_tenantId_idx" ON "attendance_sessions"("tenantId");

-- CreateIndex
CREATE INDEX "attendance_sessions_campusId_idx" ON "attendance_sessions"("campusId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_sectionId_date_period_key" ON "attendance_sessions"("sectionId", "date", "period");

-- CreateIndex
CREATE INDEX "attendance_records_tenantId_idx" ON "attendance_records"("tenantId");

-- CreateIndex
CREATE INDEX "attendance_records_studentId_idx" ON "attendance_records"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_sessionId_studentId_key" ON "attendance_records"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "messages_tenantId_idx" ON "messages"("tenantId");

-- CreateIndex
CREATE INDEX "messages_recipientUserId_idx" ON "messages"("recipientUserId");

-- CreateIndex
CREATE INDEX "messages_recipientUserId_dedupeKey_idx" ON "messages"("recipientUserId", "dedupeKey");

-- CreateIndex
CREATE INDEX "notification_preferences_tenantId_idx" ON "notification_preferences"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_category_channel_key" ON "notification_preferences"("userId", "category", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "notification_settings_userId_key" ON "notification_settings"("userId");

-- CreateIndex
CREATE INDEX "notification_settings_tenantId_idx" ON "notification_settings"("tenantId");

-- CreateIndex
CREATE INDEX "delivery_attempts_tenantId_idx" ON "delivery_attempts"("tenantId");

-- CreateIndex
CREATE INDEX "delivery_attempts_messageId_idx" ON "delivery_attempts"("messageId");

-- CreateIndex
CREATE INDEX "delivery_attempts_status_idx" ON "delivery_attempts"("status");

-- CreateIndex
CREATE INDEX "audit_events_tenantId_idx" ON "audit_events"("tenantId");

-- CreateIndex
CREATE INDEX "audit_events_actorUserId_idx" ON "audit_events"("actorUserId");

-- CreateIndex
CREATE INDEX "audit_events_createdAt_idx" ON "audit_events"("createdAt");

-- CreateIndex
CREATE INDEX "audit_events_entryHash_idx" ON "audit_events"("entryHash");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_chainKey_seq_key" ON "audit_events"("chainKey", "seq");

-- CreateIndex
CREATE INDEX "applications_tenantId_idx" ON "applications"("tenantId");

-- CreateIndex
CREATE INDEX "applications_campusId_idx" ON "applications"("campusId");

-- CreateIndex
CREATE INDEX "applications_stage_idx" ON "applications"("stage");

-- CreateIndex
CREATE INDEX "application_stage_events_applicationId_idx" ON "application_stage_events"("applicationId");

-- CreateIndex
CREATE INDEX "checklist_items_applicationId_idx" ON "checklist_items"("applicationId");

-- CreateIndex
CREATE INDEX "admission_assessments_applicationId_idx" ON "admission_assessments"("applicationId");

-- CreateIndex
CREATE INDEX "interviews_applicationId_idx" ON "interviews"("applicationId");

-- CreateIndex
CREATE INDEX "offers_applicationId_idx" ON "offers"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "offers_applicationId_version_key" ON "offers"("applicationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_conversions_applicationId_key" ON "enrollment_conversions"("applicationId");

-- CreateIndex
CREATE INDEX "enrollment_conversions_tenantId_idx" ON "enrollment_conversions"("tenantId");

-- CreateIndex
CREATE INDEX "fee_heads_tenantId_idx" ON "fee_heads"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_heads_tenantId_code_key" ON "fee_heads"("tenantId", "code");

-- CreateIndex
CREATE INDEX "fee_structures_tenantId_idx" ON "fee_structures"("tenantId");

-- CreateIndex
CREATE INDEX "fee_structures_campusId_idx" ON "fee_structures"("campusId");

-- CreateIndex
CREATE INDEX "fee_structure_lines_structureId_idx" ON "fee_structure_lines"("structureId");

-- CreateIndex
CREATE INDEX "student_fee_assignments_tenantId_idx" ON "student_fee_assignments"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_assignments_studentId_feeStructureId_key" ON "student_fee_assignments"("studentId", "feeStructureId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_idx" ON "invoices"("tenantId");

-- CreateIndex
CREATE INDEX "invoices_studentId_idx" ON "invoices"("studentId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_number_key" ON "invoices"("tenantId", "number");

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_idx" ON "invoice_lines"("invoiceId");

-- CreateIndex
CREATE INDEX "payments_tenantId_idx" ON "payments"("tenantId");

-- CreateIndex
CREATE INDEX "payments_studentId_idx" ON "payments"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenantId_number_key" ON "payments"("tenantId", "number");

-- CreateIndex
CREATE INDEX "allocations_paymentId_idx" ON "allocations"("paymentId");

-- CreateIndex
CREATE INDEX "allocations_invoiceId_idx" ON "allocations"("invoiceId");

-- CreateIndex
CREATE INDEX "credit_notes_invoiceId_idx" ON "credit_notes"("invoiceId");

-- CreateIndex
CREATE INDEX "refunds_tenantId_idx" ON "refunds"("tenantId");

-- CreateIndex
CREATE INDEX "refunds_studentId_idx" ON "refunds"("studentId");

-- CreateIndex
CREATE INDEX "billing_runs_tenantId_idx" ON "billing_runs"("tenantId");

-- CreateIndex
CREATE INDEX "subjects_tenantId_idx" ON "subjects"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenantId_code_key" ON "subjects"("tenantId", "code");

-- CreateIndex
CREATE INDEX "grade_scales_tenantId_idx" ON "grade_scales"("tenantId");

-- CreateIndex
CREATE INDEX "grade_bands_scaleId_idx" ON "grade_bands"("scaleId");

-- CreateIndex
CREATE INDEX "assessment_plans_tenantId_idx" ON "assessment_plans"("tenantId");

-- CreateIndex
CREATE INDEX "assessment_plans_sectionId_idx" ON "assessment_plans"("sectionId");

-- CreateIndex
CREATE INDEX "assessment_components_planId_idx" ON "assessment_components"("planId");

-- CreateIndex
CREATE INDEX "plan_subjects_planId_idx" ON "plan_subjects"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_subjects_planId_subjectId_key" ON "plan_subjects"("planId", "subjectId");

-- CreateIndex
CREATE INDEX "mark_entries_planId_idx" ON "mark_entries"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "mark_entries_studentId_subjectId_componentId_key" ON "mark_entries"("studentId", "subjectId", "componentId");

-- CreateIndex
CREATE INDEX "result_versions_planId_idx" ON "result_versions"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "result_versions_planId_version_key" ON "result_versions"("planId", "version");

-- CreateIndex
CREATE INDEX "student_results_resultVersionId_idx" ON "student_results"("resultVersionId");

-- CreateIndex
CREATE INDEX "student_results_studentId_idx" ON "student_results"("studentId");

-- CreateIndex
CREATE INDEX "student_result_lines_studentResultId_idx" ON "student_result_lines"("studentResultId");

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_keyId_key" ON "api_clients"("keyId");

-- CreateIndex
CREATE INDEX "api_clients_tenantId_idx" ON "api_clients"("tenantId");

-- CreateIndex
CREATE INDEX "idempotency_keys_tenantId_idx" ON "idempotency_keys"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_apiClientId_key_key" ON "idempotency_keys"("apiClientId", "key");

-- CreateIndex
CREATE INDEX "webhook_endpoints_tenantId_idx" ON "webhook_endpoints"("tenantId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_tenantId_idx" ON "webhook_deliveries"("tenantId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_endpointId_idx" ON "webhook_deliveries"("endpointId");

-- CreateIndex
CREATE INDEX "student_documents_tenantId_idx" ON "student_documents"("tenantId");

-- CreateIndex
CREATE INDEX "student_documents_studentId_idx" ON "student_documents"("studentId");

-- CreateIndex
CREATE INDEX "student_documents_expiresAt_idx" ON "student_documents"("expiresAt");

-- CreateIndex
CREATE INDEX "exam_schedules_tenantId_idx" ON "exam_schedules"("tenantId");

-- CreateIndex
CREATE INDEX "exam_schedules_campusId_idx" ON "exam_schedules"("campusId");

-- CreateIndex
CREATE INDEX "exam_invigilators_tenantId_idx" ON "exam_invigilators"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_invigilators_examScheduleId_staffId_key" ON "exam_invigilators"("examScheduleId", "staffId");

-- CreateIndex
CREATE INDEX "seat_assignments_tenantId_idx" ON "seat_assignments"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "seat_assignments_examScheduleId_studentId_key" ON "seat_assignments"("examScheduleId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "seat_assignments_examScheduleId_seatNumber_key" ON "seat_assignments"("examScheduleId", "seatNumber");

-- CreateIndex
CREATE INDEX "competencies_tenantId_idx" ON "competencies"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "competencies_tenantId_code_key" ON "competencies"("tenantId", "code");

-- CreateIndex
CREATE INDEX "student_competency_ratings_tenantId_idx" ON "student_competency_ratings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "student_competency_ratings_studentResultId_competencyId_key" ON "student_competency_ratings"("studentResultId", "competencyId");

-- CreateIndex
CREATE INDEX "message_templates_tenantId_idx" ON "message_templates"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_tenantId_code_key" ON "message_templates"("tenantId", "code");

-- CreateIndex
CREATE INDEX "plan_versions_planId_idx" ON "plan_versions"("planId");

-- CreateIndex
CREATE INDEX "bank_statement_lines_tenantId_idx" ON "bank_statement_lines"("tenantId");

-- CreateIndex
CREATE INDEX "bank_statement_lines_campusId_idx" ON "bank_statement_lines"("campusId");

-- CreateIndex
CREATE INDEX "bank_statement_lines_status_idx" ON "bank_statement_lines"("status");

-- CreateIndex
CREATE INDEX "leave_types_tenantId_idx" ON "leave_types"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_tenantId_name_key" ON "leave_types"("tenantId", "name");

-- CreateIndex
CREATE INDEX "leave_balances_tenantId_idx" ON "leave_balances"("tenantId");

-- CreateIndex
CREATE INDEX "leave_balances_personId_idx" ON "leave_balances"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_leaveTypeId_personId_academicYearId_key" ON "leave_balances"("leaveTypeId", "personId", "academicYearId");

-- CreateIndex
CREATE INDEX "leave_requests_tenantId_idx" ON "leave_requests"("tenantId");

-- CreateIndex
CREATE INDEX "leave_requests_personId_idx" ON "leave_requests"("personId");

-- CreateIndex
CREATE INDEX "rooms_tenantId_idx" ON "rooms"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_campusId_code_key" ON "rooms"("campusId", "code");

-- CreateIndex
CREATE INDEX "timetable_versions_tenantId_idx" ON "timetable_versions"("tenantId");

-- CreateIndex
CREATE INDEX "timetable_versions_campusId_idx" ON "timetable_versions"("campusId");

-- CreateIndex
CREATE INDEX "timetable_slots_tenantId_idx" ON "timetable_slots"("tenantId");

-- CreateIndex
CREATE INDEX "timetable_slots_versionId_idx" ON "timetable_slots"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_slots_versionId_sectionId_dayOfWeek_periodNumber_key" ON "timetable_slots"("versionId", "sectionId", "dayOfWeek", "periodNumber");

-- CreateIndex
CREATE INDEX "approval_requests_tenantId_idx" ON "approval_requests"("tenantId");

-- CreateIndex
CREATE INDEX "approval_requests_requestedByUserId_idx" ON "approval_requests"("requestedByUserId");

-- CreateIndex
CREATE INDEX "approval_requests_assignedToUserId_idx" ON "approval_requests"("assignedToUserId");

-- CreateIndex
CREATE INDEX "approval_requests_status_idx" ON "approval_requests"("status");

-- CreateIndex
CREATE INDEX "departments_tenantId_idx" ON "departments"("tenantId");

-- CreateIndex
CREATE INDEX "positions_tenantId_idx" ON "positions"("tenantId");

-- CreateIndex
CREATE INDEX "employment_records_tenantId_idx" ON "employment_records"("tenantId");

-- CreateIndex
CREATE INDEX "employment_records_staffId_idx" ON "employment_records"("staffId");

-- CreateIndex
CREATE INDEX "payroll_inputs_tenantId_idx" ON "payroll_inputs"("tenantId");

-- CreateIndex
CREATE INDEX "payroll_inputs_staffId_idx" ON "payroll_inputs"("staffId");

-- CreateIndex
CREATE INDEX "performance_reviews_tenantId_idx" ON "performance_reviews"("tenantId");

-- CreateIndex
CREATE INDEX "performance_reviews_staffId_idx" ON "performance_reviews"("staffId");

-- CreateIndex
CREATE INDEX "separation_checklists_tenantId_idx" ON "separation_checklists"("tenantId");

-- CreateIndex
CREATE INDEX "separation_checklists_staffId_idx" ON "separation_checklists"("staffId");

-- CreateIndex
CREATE INDEX "library_categories_tenantId_idx" ON "library_categories"("tenantId");

-- CreateIndex
CREATE INDEX "library_authors_tenantId_idx" ON "library_authors"("tenantId");

-- CreateIndex
CREATE INDEX "library_items_tenantId_idx" ON "library_items"("tenantId");

-- CreateIndex
CREATE INDEX "library_copies_tenantId_idx" ON "library_copies"("tenantId");

-- CreateIndex
CREATE INDEX "library_circulations_tenantId_idx" ON "library_circulations"("tenantId");

-- CreateIndex
CREATE INDEX "library_circulations_borrowerUserId_idx" ON "library_circulations"("borrowerUserId");

-- CreateIndex
CREATE INDEX "library_reservations_tenantId_idx" ON "library_reservations"("tenantId");

-- CreateIndex
CREATE INDEX "vehicles_tenantId_idx" ON "vehicles"("tenantId");

-- CreateIndex
CREATE INDEX "routes_tenantId_idx" ON "routes"("tenantId");

-- CreateIndex
CREATE INDEX "stops_tenantId_idx" ON "stops"("tenantId");

-- CreateIndex
CREATE INDEX "route_assignments_tenantId_idx" ON "route_assignments"("tenantId");

-- CreateIndex
CREATE INDEX "route_assignments_studentId_idx" ON "route_assignments"("studentId");

-- CreateIndex
CREATE INDEX "trip_attendances_tenantId_idx" ON "trip_attendances"("tenantId");

-- CreateIndex
CREATE INDEX "inventory_categories_tenantId_idx" ON "inventory_categories"("tenantId");

-- CreateIndex
CREATE INDEX "suppliers_tenantId_idx" ON "suppliers"("tenantId");

-- CreateIndex
CREATE INDEX "warehouses_tenantId_idx" ON "warehouses"("tenantId");

-- CreateIndex
CREATE INDEX "inventory_items_tenantId_idx" ON "inventory_items"("tenantId");

-- CreateIndex
CREATE INDEX "stock_ledger_entries_tenantId_idx" ON "stock_ledger_entries"("tenantId");

-- CreateIndex
CREATE INDEX "stock_ledger_entries_itemId_idx" ON "stock_ledger_entries"("itemId");

-- CreateIndex
CREATE INDEX "requisitions_tenantId_idx" ON "requisitions"("tenantId");

-- CreateIndex
CREATE INDEX "requisition_lines_tenantId_idx" ON "requisition_lines"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_idx" ON "purchase_orders"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_order_lines_tenantId_idx" ON "purchase_order_lines"("tenantId");

-- CreateIndex
CREATE INDEX "asset_assignments_tenantId_idx" ON "asset_assignments"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "health_records_studentId_key" ON "health_records"("studentId");

-- CreateIndex
CREATE INDEX "health_records_tenantId_idx" ON "health_records"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "health_records_tenantId_studentId_key" ON "health_records"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "health_incidents_tenantId_idx" ON "health_incidents"("tenantId");

-- CreateIndex
CREATE INDEX "safeguarding_cases_tenantId_idx" ON "safeguarding_cases"("tenantId");

-- CreateIndex
CREATE INDEX "safeguarding_cases_studentId_idx" ON "safeguarding_cases"("studentId");

-- CreateIndex
CREATE INDEX "safeguarding_notes_tenantId_idx" ON "safeguarding_notes"("tenantId");

-- AddForeignKey
ALTER TABLE "org_settings" ADD CONSTRAINT "org_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campuses" ADD CONSTRAINT "campuses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus_settings" ADD CONSTRAINT "campus_settings_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_relationships" ADD CONSTRAINT "guardian_relationships_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_relationships" ADD CONSTRAINT "guardian_relationships_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_levels" ADD CONSTRAINT "grade_levels_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "grade_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_homeroomStaffId_fkey" FOREIGN KEY ("homeroomStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "grade_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_takenByStaffId_fkey" FOREIGN KEY ("takenByStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "attendance_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_applicantPersonId_fkey" FOREIGN KEY ("applicantPersonId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "grade_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_events" ADD CONSTRAINT "application_stage_events_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_assessments" ADD CONSTRAINT "admission_assessments_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_conversions" ADD CONSTRAINT "enrollment_conversions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "grade_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_lines" ADD CONSTRAINT "fee_structure_lines_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "fee_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_lines" ADD CONSTRAINT "fee_structure_lines_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "fee_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "fee_structures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "fee_heads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "grade_scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_plans" ADD CONSTRAINT "assessment_plans_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_plans" ADD CONSTRAINT "assessment_plans_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_plans" ADD CONSTRAINT "assessment_plans_gradeScaleId_fkey" FOREIGN KEY ("gradeScaleId") REFERENCES "grade_scales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_components" ADD CONSTRAINT "assessment_components_planId_fkey" FOREIGN KEY ("planId") REFERENCES "assessment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_subjects" ADD CONSTRAINT "plan_subjects_planId_fkey" FOREIGN KEY ("planId") REFERENCES "assessment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_subjects" ADD CONSTRAINT "plan_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_planId_fkey" FOREIGN KEY ("planId") REFERENCES "assessment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "assessment_components"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_versions" ADD CONSTRAINT "result_versions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "assessment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_results" ADD CONSTRAINT "student_results_resultVersionId_fkey" FOREIGN KEY ("resultVersionId") REFERENCES "result_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_results" ADD CONSTRAINT "student_results_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_result_lines" ADD CONSTRAINT "student_result_lines_studentResultId_fkey" FOREIGN KEY ("studentResultId") REFERENCES "student_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_apiClientId_fkey" FOREIGN KEY ("apiClientId") REFERENCES "api_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_invigilators" ADD CONSTRAINT "exam_invigilators_examScheduleId_fkey" FOREIGN KEY ("examScheduleId") REFERENCES "exam_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_invigilators" ADD CONSTRAINT "exam_invigilators_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_examScheduleId_fkey" FOREIGN KEY ("examScheduleId") REFERENCES "exam_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_competency_ratings" ADD CONSTRAINT "student_competency_ratings_studentResultId_fkey" FOREIGN KEY ("studentResultId") REFERENCES "student_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_competency_ratings" ADD CONSTRAINT "student_competency_ratings_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "competencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "timetable_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_records" ADD CONSTRAINT "employment_records_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_records" ADD CONSTRAINT "employment_records_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_records" ADD CONSTRAINT "employment_records_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "separation_checklists" ADD CONSTRAINT "separation_checklists_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "separation_checklists" ADD CONSTRAINT "separation_checklists_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_categories" ADD CONSTRAINT "library_categories_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "library_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "library_authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_copies" ADD CONSTRAINT "library_copies_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_circulations" ADD CONSTRAINT "library_circulations_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_circulations" ADD CONSTRAINT "library_circulations_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "library_copies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_circulations" ADD CONSTRAINT "library_circulations_borrowerUserId_fkey" FOREIGN KEY ("borrowerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "library_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_reservedByUserId_fkey" FOREIGN KEY ("reservedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driverStaffId_fkey" FOREIGN KEY ("driverStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stops" ADD CONSTRAINT "stops_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_assignments" ADD CONSTRAINT "route_assignments_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_assignments" ADD CONSTRAINT "route_assignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_attendances" ADD CONSTRAINT "trip_attendances_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_categories" ADD CONSTRAINT "inventory_categories_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "inventory_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_incidents" ADD CONSTRAINT "health_incidents_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_incidents" ADD CONSTRAINT "health_incidents_healthRecordId_fkey" FOREIGN KEY ("healthRecordId") REFERENCES "health_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_cases" ADD CONSTRAINT "safeguarding_cases_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_cases" ADD CONSTRAINT "safeguarding_cases_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_notes" ADD CONSTRAINT "safeguarding_notes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "safeguarding_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

