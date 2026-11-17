import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api-request";
import { apiError, apiOk } from "@/lib/api-response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate(request, "student.read");
  if (!auth.ok) return auth.response;
  const { client, correlationId } = auth;
  const { id } = await params;

  const student = await prisma.student.findFirst({
    where: { id, tenantId: client.tenantId },
    include: {
      person: true,
      enrollments: {
        where: { status: "ACTIVE" },
        include: { campus: true, gradeLevel: true, section: true },
        take: 1,
      },
    },
  });
  if (!student) {
    return apiError(404, "not_found", "No student with that id.", correlationId);
  }

  const enrollment = student.enrollments[0];
  return apiOk(
    {
      id: student.id,
      admissionNumber: student.admissionNumber,
      status: student.status,
      firstName: student.person.firstName,
      lastName: student.person.lastName,
      dateOfBirth: student.person.dateOfBirth,
      gender: student.person.gender,
      enrollment: enrollment
        ? {
            campus: { id: enrollment.campus.id, name: enrollment.campus.name },
            gradeLevel: { id: enrollment.gradeLevel.id, name: enrollment.gradeLevel.name },
            section: { id: enrollment.section.id, name: enrollment.section.name },
          }
        : null,
    },
    correlationId,
  );
}
