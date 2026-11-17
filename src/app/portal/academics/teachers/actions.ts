"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canForCampus, requireUser } from "@/lib/rbac";

export async function assignTeacher(form: FormData) {
  const ctx = await requireUser(); const campusId = String(form.get("campusId") ?? "");
  if (!ctx.tenantId || !canForCampus(ctx, "academics.write", campusId)) throw new Error("Permission denied");
  const staffId = String(form.get("staffId") ?? ""), subjectId = String(form.get("subjectId") ?? ""), sectionId = String(form.get("sectionId") ?? ""), academicYearId = String(form.get("academicYearId") ?? "");
  const [staff, section, subject, year] = await Promise.all([prisma.staff.findFirst({where:{id:staffId,tenantId:ctx.tenantId}}),prisma.section.findFirst({where:{id:sectionId,tenantId:ctx.tenantId,campusId}}),prisma.subject.findFirst({where:{id:subjectId,tenantId:ctx.tenantId}}),prisma.academicYear.findFirst({where:{id:academicYearId,tenantId:ctx.tenantId,campusId}})]);
  if (!staff || !section || !subject || !year) throw new Error("Invalid teacher assignment");
  const record=await prisma.teacherAssignment.upsert({where:{staffId_subjectId_sectionId_academicYearId:{staffId,subjectId,sectionId,academicYearId}},update:{},create:{tenantId:ctx.tenantId,campusId,staffId,subjectId,sectionId,academicYearId}});
  await audit({tenantId:ctx.tenantId,actorUserId:ctx.user.id,action:"teacher.assignment.created",targetType:"TeacherAssignment",targetId:record.id,campusId}); revalidatePath("/portal/academics/teachers");
}
export async function assignSubstitute(form: FormData) {
  const ctx=await requireUser(); const campusId=String(form.get("campusId")??""); if(!ctx.tenantId||!canForCampus(ctx,"timetable.write",campusId)) throw new Error("Permission denied");
  const timetableSlotId=String(form.get("timetableSlotId")??""), absentStaffId=String(form.get("absentStaffId")??""), substituteStaffId=String(form.get("substituteStaffId")??""), date=new Date(String(form.get("date")??"")),reason=String(form.get("reason")??"").trim();
  const slot=await prisma.timetableSlot.findFirst({where:{id:timetableSlotId,tenantId:ctx.tenantId},include:{version:true}}); const substitute=await prisma.staff.findFirst({where:{id:substituteStaffId,tenantId:ctx.tenantId}});
  if(!slot||slot.version.campusId!==campusId||!substitute||!reason||!date.getTime()) throw new Error("Invalid substitute coverage");
  const record=await prisma.substituteAssignment.upsert({where:{timetableSlotId_date:{timetableSlotId,date}},update:{absentStaffId,substituteStaffId,reason,assignedByUserId:ctx.user.id},create:{tenantId:ctx.tenantId,campusId,timetableSlotId,absentStaffId,substituteStaffId,date,reason,assignedByUserId:ctx.user.id}});
  await audit({tenantId:ctx.tenantId,actorUserId:ctx.user.id,action:"teacher.substitute.assigned",targetType:"SubstituteAssignment",targetId:record.id,campusId}); revalidatePath("/portal/academics/teachers");
}
