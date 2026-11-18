import { requireUser, canAnywhere } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { parseDay, SHORTAGE_DEFAULT } from "@/lib/attendance";
import { attendanceReport } from "@/lib/attendance-report";
import { reportCsv } from "@/lib/report-format";

export async function GET(request: Request) {
  const ctx = await requireUser();
  if (!canAnywhere(ctx, "attendance.read")) return new Response("Access denied", { status: 403 });
  const p = new URL(request.url).searchParams;
  const from = parseDay(p.get("from")), to = parseDay(p.get("to"));
  if (!from || !to || from > to) return new Response("Invalid date range", { status: 400 });
  const view = p.get("view") === "daily" ? "daily" : "summary";
  const sectionId = p.get("sectionId") || undefined;
  const campusIds = allowedCampusIds(ctx, "attendance.read");
  if (sectionId) {
    const sec = await prisma.section.findFirst({ where: { id: sectionId, tenantId: ctx.tenantId! }, select: { campusId: true } });
    if (!sec || (campusIds && !campusIds.includes(sec.campusId))) return new Response("Section not found", { status: 404 });
  }
  const threshold = Math.min(100, Math.max(0, Number(p.get("threshold")) || SHORTAGE_DEFAULT));
  const data = await attendanceReport({ tenantId: ctx.tenantId!, campusIds, sectionId, from, to });
  const rows = view === "daily"
    ? [["Date", "Section", "Student", "Admission no.", "Code", "Status"],
       ...data.daily.map((d) => [d.date.toISOString().slice(0, 10), d.section, d.student, d.admissionNumber, d.code, d.label])]
    : [["Student", "Admission no.", "Section", "Campus", "Present", "Absent", "Late", "Excused", "Leave", "Remote", "Marked", "Attendance %", `Below ${threshold}%`],
       ...data.students.map((s) => [s.name, s.admissionNumber, s.section, s.campus, ...(["present", "absent", "late", "excused", "leave", "remote", "total"] as const).map((k) => String(s.tally[k])), s.pct === null ? "" : String(s.pct), s.pct !== null && s.pct < threshold ? "Yes" : "No"])];
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "report.exported", targetType: "AttendanceReport", metadata: { view, from: p.get("from"), to: p.get("to"), rows: rows.length - 1 } });
  return new Response(reportCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="attendance-${view}-${p.get("from")}-to-${p.get("to")}.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
