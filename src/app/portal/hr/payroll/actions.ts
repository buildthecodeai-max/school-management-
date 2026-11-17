"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function createPayrollRun(form: FormData) {
  const ctx=await requireUser(); const campusId=String(form.get("campusId")??""); const periodLabel=String(form.get("periodLabel")??"").trim();
  if(!ctx.tenantId||!canForCampus(ctx,"hr.payroll.write",campusId)||!periodLabel) throw new Error("Permission denied or invalid payroll period.");
  const existing=await prisma.payrollRun.findFirst({where:{tenantId:ctx.tenantId,campusId,periodLabel}}); if(existing) throw new Error("A payroll run already exists for this period.");
  const employment=await prisma.employmentRecord.findMany({where:{tenantId:ctx.tenantId,campusId,endDate:null},include:{staff:true}});
  const run=await prisma.$transaction(async tx=>{const r=await tx.payrollRun.create({data:{tenantId:ctx.tenantId!,campusId,periodLabel,processedByUserId:ctx.user.id}});for(const e of employment){const [loans,advances]=await Promise.all([tx.staffLoan.findMany({where:{tenantId:ctx.tenantId!,staffId:e.staffId,active:true}}),tx.staffAdvance.findMany({where:{tenantId:ctx.tenantId!,staffId:e.staffId,recovered:false}})]);const loanDeduction=loans.reduce((s,l)=>s+Math.min(l.balance,l.installmentAmount),0);const advanceDeduction=advances.reduce((s,a)=>s+a.amount,0);const deductions=Math.min(e.salary,loanDeduction+advanceDeduction);await tx.payslip.create({data:{tenantId:ctx.tenantId!,campusId,payrollRunId:r.id,staffId:e.staffId,grossPay:e.salary,deductions,netPay:e.salary-deductions,breakdown:{loanDeduction,advanceDeduction}}});for(const l of loans){const paid=Math.min(l.balance,l.installmentAmount);await tx.staffLoan.update({where:{id:l.id},data:{balance:{decrement:paid},active:l.balance>paid}})}if(advances.length)await tx.staffAdvance.updateMany({where:{id:{in:advances.map(a=>a.id)}},data:{recovered:true}})}return r});
  await audit({tenantId:ctx.tenantId,actorUserId:ctx.user.id,action:"payroll.run.calculated",targetType:"PayrollRun",targetId:run.id,campusId,metadata:{periodLabel}});revalidatePath("/portal/hr/payroll");
}
export async function postPayrollRun(form: FormData) { const ctx=await requireUser();const id=String(form.get("runId")??"");const run=await prisma.payrollRun.findFirst({where:{id,tenantId:ctx.tenantId??""}});if(!run||!canForCampus(ctx,"hr.payroll.write",run.campusId)||run.status!=="DRAFT")throw new Error("Payroll run cannot be posted.");await prisma.payrollRun.update({where:{id},data:{status:"POSTED",postedAt:new Date()}});await audit({tenantId:ctx.tenantId,actorUserId:ctx.user.id,action:"payroll.run.posted",targetType:"PayrollRun",targetId:id,campusId:run.campusId});revalidatePath("/portal/hr/payroll"); }
