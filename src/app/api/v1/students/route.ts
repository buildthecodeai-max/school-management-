import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api-request";
import { apiError, apiOk, apiList, parsePageParams, parseSortParam, applyFields } from "@/lib/api-response";
import { withIdempotency } from "@/lib/api-idempotency";
import { nextAdmissionNumber } from "@/lib/admissions-server";
import { checkLimit } from "@/lib/entitlements";
import { z } from "zod";
import type { StudentStatus } from "@prisma/client";

const STUDENT_STATUSES = ["APPLICANT", "ENROLLED", "WITHDRAWN", "GRADUATED", "TRANSFERRED"];

// GET /api/v1/students — list, tenant-scoped, cursor-paginated (API-004).
export async function GET(request: Request) {
  const auth = await authenticate(request, "student.read");
  if (!auth.ok) return auth.response;
  const { client, correlationId } = auth;

  const url = new URL(request.url);
  const { limit, cursor } = parsePageParams(url);
  const campusId = url.searchParams.get("campusId") || undefined;
  const statusParam = url.searchParams.get("status") || undefined;
  if (statusParam && !STUDENT_STATUSES.includes(statusParam)) {
    return apiError(422, "validation_error", `Invalid status "${statusParam}".`, correlationId);
  }

  const SORTABLE = ["lastName", "firstName", "admissionNumber", "id"];
  const sortRaw = parseSortParam(url, SORTABLE);
  // Map top-level field names to nested Prisma paths for enrollment queries
  const sortMap: Record<string, object> = {
    lastName: { student: { person: { lastName: sortRaw.lastName ?? "asc" } } },
    firstName: { student: { person: { firstName: sortRaw.firstName ?? "asc" } } },
    admissionNumber: { student: { admissionNumber: sortRaw.admissionNumber ?? "asc" } },
    id: { id: sortRaw.id ?? "asc" },
  };
  const sortField = Object.keys(sortRaw)[0] ?? "id";
  const orderBy = sortMap[sortField] ?? { id: "asc" };
  // When sorting by non-id field, cursor-based pagination needs id as tiebreaker
  const isCursorSort = sortField === "id";

  const enrollments = await prisma.enrollment.findMany({
    where: {
      tenantId: client.tenantId,
      status: "ACTIVE",
      ...(campusId ? { campusId } : {}),
      ...(isCursorSort && cursor ? { id: { gt: cursor } } : {}),
      ...(statusParam ? { student: { status: statusParam as StudentStatus } } : {}),
    },
    include: {
      student: { include: { person: true } },
      campus: true,
      gradeLevel: true,
      section: true,
    },
    orderBy,
    take: limit + 1,
  });

  const rawItems = enrollments.map((e) => ({
    id: e.id,
    studentId: e.student.id,
    admissionNumber: e.student.admissionNumber,
    status: e.student.status,
    firstName: e.student.person.firstName,
    lastName: e.student.person.lastName,
    dateOfBirth: e.student.person.dateOfBirth,
    campus: { id: e.campus.id, name: e.campus.name },
    gradeLevel: { id: e.gradeLevel.id, name: e.gradeLevel.name },
    section: { id: e.section.id, name: e.section.name },
  }));

  const items = rawItems.map((item) => applyFields(item, url));
  return apiList(items as { id: string }[], limit, correlationId);
}

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  sectionId: z.string().min(1),
  admissionNumber: z.string().min(1).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]).optional(),
});

// POST /api/v1/students — create a student + active enrollment (API-002/003).
// Supports `Idempotency-Key` since a duplicate retry would otherwise create
// a duplicate student record.
export async function POST(request: Request) {
  const auth = await authenticate(request, "student.write");
  if (!auth.ok) return auth.response;
  const { client, correlationId } = auth;

  const rawBody = await request.json().catch(() => null);
  return withIdempotency(request, client.apiClientId, client.tenantId, rawBody, async () => {
    const parsed = createSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(422, "validation_error", parsed.error.issues[0]?.message ?? "Invalid body", correlationId);
    }
    const d = parsed.data;

    const section = await prisma.section.findFirst({
      where: { id: d.sectionId, tenantId: client.tenantId },
    });
    if (!section) {
      return apiError(422, "validation_error", `Unknown sectionId "${d.sectionId}".`, correlationId);
    }

    const admissionNumber = d.admissionNumber ?? (await nextAdmissionNumber(client.tenantId));
    const dup = await prisma.student.findUnique({
      where: { tenantId_admissionNumber: { tenantId: client.tenantId, admissionNumber } },
    });
    if (dup) {
      return apiError(422, "validation_error", `Admission number "${admissionNumber}" already exists.`, correlationId);
    }

    const limitError = await checkLimit(client.tenantId, "students");
    if (limitError) {
      return apiError(422, "plan_limit_exceeded", limitError, correlationId);
    }

    const created = await prisma.$transaction(async (tx) => {
      const person = await tx.person.create({
        data: {
          tenantId: client.tenantId,
          firstName: d.firstName,
          lastName: d.lastName,
          dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : null,
          gender: d.gender ?? "UNDISCLOSED",
        },
      });
      const student = await tx.student.create({
        data: {
          tenantId: client.tenantId,
          personId: person.id,
          admissionNumber,
          status: "ENROLLED",
        },
      });
      const enrollment = await tx.enrollment.create({
        data: {
          tenantId: client.tenantId,
          studentId: student.id,
          campusId: section.campusId,
          academicYearId: section.academicYearId,
          gradeLevelId: section.gradeLevelId,
          sectionId: section.id,
          status: "ACTIVE",
        },
      });
      return { student, enrollment };
    });

    return apiOk(
      {
        id: created.student.id,
        admissionNumber: created.student.admissionNumber,
        status: created.student.status,
        enrollmentId: created.enrollment.id,
        sectionId: section.id,
      },
      correlationId,
      201,
    );
  });
}
