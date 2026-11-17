import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api-request";
import { apiError, apiList, parsePageParams, parseSortParam, applyFields } from "@/lib/api-response";

// GET /api/v1/attendance/sessions — list registers, optionally filtered by
// section and/or date (API-004).
export async function GET(request: Request) {
  const auth = await authenticate(request, "attendance.read");
  if (!auth.ok) return auth.response;
  const { client, correlationId } = auth;

  const url = new URL(request.url);
  const { limit, cursor } = parsePageParams(url);
  const sectionId = url.searchParams.get("sectionId") || undefined;
  const dateParam = url.searchParams.get("date");

  let dateFilter: { gte: Date; lte: Date } | undefined;
  if (dateParam) {
    const d = new Date(dateParam);
    if (isNaN(d.getTime())) {
      return apiError(422, "validation_error", `Invalid date "${dateParam}". Use YYYY-MM-DD.`, correlationId);
    }
    d.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    dateFilter = { gte: d, lte: end };
  }

  const sortOrder = parseSortParam(url, ["date", "id"], { date: "desc" });

  const sessions = await prisma.attendanceSession.findMany({
    where: {
      tenantId: client.tenantId,
      ...(sectionId ? { sectionId } : {}),
      ...(dateFilter ? { date: dateFilter } : {}),
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    include: {
      section: { include: { gradeLevel: true, campus: true } },
      records: { include: { code: true } },
    },
    orderBy: sortOrder,
    take: limit + 1,
  });

  const rawItems = sessions.map((s) => ({
    id: s.id,
    date: s.date.toISOString().slice(0, 10),
    status: s.status,
    section: { id: s.section.id, name: s.section.name, gradeLevel: s.section.gradeLevel.name },
    campus: { id: s.section.campus.id, name: s.section.campus.name },
    recordCount: s.records.length,
    presentCount: s.records.filter((r) => r.code.countsAsPresent).length,
  }));

  const items = rawItems.map((item) => applyFields(item, url));
  return apiList(items as { id: string }[], limit, correlationId);
}
