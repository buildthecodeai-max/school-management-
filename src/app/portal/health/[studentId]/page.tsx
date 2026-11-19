import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { currentCampusOf } from "@/lib/restricted";
import { PageHeader, Card, Badge } from "@/components/ui";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { saveHealthRecord, reportHealthIncident } from "../actions";

export const metadata = { title: "Health record" };

export default async function StudentHealthPage({ params }: { params: Promise<{ studentId: string }> }) {
  const ctx = await requireUser();
  const { studentId } = await params;
  const student = await prisma.student.findFirst({ where: { id: studentId, tenantId: ctx.tenantId! }, include: { person: true } });
  if (!student) notFound();
  const record = await prisma.healthRecord.findFirst({ where: { studentId, tenantId: ctx.tenantId! }, include: { incidents: { orderBy: { occurredAt: "desc" }, take: 50 } } });
  const campusId = (await currentCampusOf(ctx.tenantId!, studentId)) ?? record?.campusId;
  if (!campusId || !canForCampus(ctx, "health.record.read", campusId)) notFound();
  const canWrite = canForCampus(ctx, "health.record.write", campusId);
  const canIncident = !!record && canForCampus(ctx, "health.incident.write", campusId);

  // Reading medical data is itself an audited event.
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "health.record.viewed", targetType: "HealthRecord", targetId: record?.id, campusId, scopeType: "CAMPUS", metadata: { studentId } });

  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return (
    <div className="max-w-3xl">
      <div className="mb-4"><Link href="/portal/health" className="text-sm text-brand-700 hover:underline">← Health records</Link></div>
      <PageHeader title={`${student.person.firstName} ${student.person.lastName}`} subtitle={`Admission no. ${student.admissionNumber}`} action={<Badge tone="amber">Restricted</Badge>} />

      <Card className="mb-6">
        <h3 className="mb-3 font-semibold">Health record</h3>
        {canWrite ? (
          <ActionForm action={saveHealthRecord} submit={record ? "Save changes" : "Create record"} pendingLabel="Saving…" className="space-y-3">
            <input type="hidden" name="studentId" value={studentId} />
            <label className="block"><span className={labelCls}>Allergies</span><textarea name="allergies" rows={2} maxLength={1000} defaultValue={record?.allergies ?? ""} className={inputCls} /></label>
            <label className="block"><span className={labelCls}>Medical conditions</span><textarea name="conditions" rows={2} maxLength={1000} defaultValue={record?.conditions ?? ""} className={inputCls} /></label>
            <label className="block"><span className={labelCls}>Emergency contact</span><input name="emergencyContact" maxLength={300} defaultValue={record?.emergencyContact ?? ""} className={inputCls} /></label>
            <label className="block"><span className={labelCls}>Notes</span><textarea name="notes" rows={3} maxLength={2000} defaultValue={record?.notes ?? ""} className={inputCls} /></label>
          </ActionForm>
        ) : record ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-[color:var(--color-muted)]">Allergies</dt><dd>{record.allergies ?? "None"}</dd></div>
            <div><dt className="text-xs text-[color:var(--color-muted)]">Conditions</dt><dd>{record.conditions ?? "None"}</dd></div>
            <div><dt className="text-xs text-[color:var(--color-muted)]">Emergency contact</dt><dd>{record.emergencyContact ?? "—"}</dd></div>
            <div><dt className="text-xs text-[color:var(--color-muted)]">Notes</dt><dd>{record.notes ?? "—"}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-[color:var(--color-muted)]">No health record on file.</p>
        )}
      </Card>

      {record && (
        <Card>
          <h3 className="mb-3 font-semibold">Incidents ({record.incidents.length})</h3>
          {record.incidents.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">None reported.</p> : (
            <ul className="divide-y divide-[color:var(--color-line)] text-sm">
              {record.incidents.map((i) => (
                <li key={i.id} className="py-2"><span className="text-xs text-[color:var(--color-muted)]">{i.occurredAt.toLocaleString()}</span><p>{i.description}</p></li>
              ))}
            </ul>
          )}
          {canIncident && (
            <ActionForm action={reportHealthIncident} submit="Report incident" pendingLabel="Saving…" className="mt-4 space-y-3 border-t border-[color:var(--color-line)] pt-4">
              <input type="hidden" name="healthRecordId" value={record.id} />
              <label className="block"><span className={labelCls}>When</span><input type="datetime-local" name="occurredAt" defaultValue={now} max={now} required className={inputCls} /></label>
              <label className="block"><span className={labelCls}>What happened and what was done</span><textarea name="description" rows={3} required minLength={5} maxLength={1500} className={inputCls} /></label>
            </ActionForm>
          )}
        </Card>
      )}
    </div>
  );
}
