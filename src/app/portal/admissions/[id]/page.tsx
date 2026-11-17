import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, canForCampus } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { checkLimit } from "@/lib/entitlements";
import { findDuplicates } from "@/lib/admissions-server";
import { STAGE_META, nextStage, ageInDays, isActive } from "@/lib/admissions";
import { PageHeader, Card, Badge } from "@/components/ui";
import {
  advanceStage,
  setSideStage,
  toggleChecklistItem,
  scheduleInterview,
  recordAssessment,
  issueOffer,
  respondOffer,
  convertToEnrolled,
  deleteApplication,
  reAdmit,
} from "../actions";

const SOURCE_LABEL: Record<string, string> = {
  WEBSITE: "Website",
  WALK_IN: "Walk-in",
  REFERRAL: "Referral",
  STAFF: "Staff entry",
  API: "API",
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePermission("admissions.read");
  const { id } = await params;

  const app = await prisma.application.findFirst({
    where: { id, tenantId: ctx.tenantId! },
    include: {
      applicant: true,
      campus: true,
      gradeLevel: true,
      checklist: { orderBy: { label: "asc" } },
      interviews: { orderBy: { scheduledAt: "desc" } },
      assessments: { orderBy: { assessedAt: "desc" } },
      offers: { orderBy: { version: "desc" } },
      stageEvents: { orderBy: { createdAt: "desc" } },
      conversion: true,
    },
  });
  if (!app) notFound();

  const allowed = allowedCampusIds(ctx, "admissions.read");
  if (allowed && !allowed.includes(app.campusId)) notFound();

  const canWrite = canForCampus(ctx, "admissions.write", app.campusId);
  const canDecide = canForCampus(ctx, "admissions.decide", app.campusId);
  const canConvert = canForCampus(ctx, "admissions.convert", app.campusId);
  // Surfaced before the click; convertToEnrolled still enforces server-side.
  const limitError =
    app.stage === "ACCEPTED" ? await checkLimit(ctx.tenantId!, "students") : null;

  const duplicates = await findDuplicates(
    ctx.tenantId!,
    {
      firstName: app.applicant.firstName,
      lastName: app.applicant.lastName,
      dateOfBirth: app.applicant.dateOfBirth,
      email: app.applicant.email,
      phone: app.applicant.phone,
    },
    app.applicantPersonId,
  );

  // Fetch sections for the class picker shown when converting an ACCEPTED applicant.
  const conversionSections =
    app.stage === "ACCEPTED" && app.gradeLevelId
      ? await (async () => {
          const year = await prisma.academicYear.findFirst({
            where: { campusId: app.campusId, isCurrent: true },
          });
          if (!year) return [];
          return prisma.section.findMany({
            where: {
              campusId: app.campusId,
              gradeLevelId: app.gradeLevelId ?? undefined,
              academicYearId: year.id,
            },
            include: {
              _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
            },
            orderBy: { name: "asc" },
          });
        })()
      : [];

  const meta = STAGE_META[app.stage];
  const next = nextStage(app.stage);
  const requiredIncomplete = app.checklist.filter(
    (c) => c.required && !c.completed,
  ).length;
  const outstandingOffer = app.offers.find((o) => o.status === "ISSUED");
  const p = app.applicant;

  return (
    <div>
      <div className="mb-4">
        <Link href="/portal/admissions" className="text-sm text-brand-700 hover:underline">
          ← Pipeline
        </Link>
      </div>

      <PageHeader
        title={`${p.firstName} ${p.lastName}`}
        subtitle={`${app.gradeLevel?.name ?? "Grade TBD"} · ${app.campus.name} · ${SOURCE_LABEL[app.source]} · ${ageInDays(app.appliedAt)} days old`}
        action={<Badge tone={meta.tone}>{meta.label}</Badge>}
      />

      {duplicates.length > 0 && !app.conversion && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">
            Possible duplicate {duplicates.length === 1 ? "record" : "records"} found
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-800">
            {duplicates.map((d) => (
              <li key={d.personId} className="flex items-center gap-2">
                <span className="font-medium">{d.name}</span>
                <span className="text-amber-700">({d.reasons.join(", ")})</span>
                {d.admissionNumber && (
                  <span className="rounded bg-amber-100 px-1.5 text-xs">
                    {d.admissionNumber}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-700">
            Review before converting to avoid creating a duplicate person (ADM-003).
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left: main record */}
        <div className="space-y-4 lg:col-span-2">
          {/* Applicant & household */}
          <Card>
            <h3 className="mb-3 font-semibold">Applicant &amp; household</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <Row label="Applicant" value={`${p.firstName} ${p.lastName}`} />
              <Row label="Date of birth" value={p.dateOfBirth ? p.dateOfBirth.toLocaleDateString() : "—"} />
              <Row label="Applicant email" value={p.email ?? "—"} />
              <Row label="Applicant phone" value={p.phone ?? "—"} />
              <Row label="Guardian" value={app.guardianName ?? "—"} />
              <Row label="Relationship" value={app.guardianRelationship ?? "—"} />
              <Row label="Guardian email" value={app.guardianEmail ?? "—"} />
              <Row label="Guardian phone" value={app.guardianPhone ?? "—"} />
              <Row label="Prior school" value={app.priorSchool ?? "—"} />
            </div>
            {app.notes && (
              <p className="mt-3 rounded bg-slate-50 p-2 text-sm text-slate-600">
                {app.notes}
              </p>
            )}
          </Card>

          {/* Checklist */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Requirements checklist</h3>
              {requiredIncomplete > 0 ? (
                <Badge tone="amber">{requiredIncomplete} outstanding</Badge>
              ) : (
                <Badge tone="green">Complete</Badge>
              )}
            </div>
            <ul className="space-y-1.5">
              {app.checklist.map((item) => (
                <li key={item.id} className="flex items-center gap-3">
                  <form action={toggleChecklistItem}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <button
                      type="submit"
                      disabled={!canWrite}
                      aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
                      className={`flex h-5 w-5 items-center justify-center rounded border transition ${
                        item.completed
                          ? "border-green-600 bg-green-600 text-white"
                          : "border-slate-300 bg-white hover:border-brand-400"
                      } ${!canWrite ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      {item.completed ? "✓" : ""}
                    </button>
                  </form>
                  <span className={`text-sm ${item.completed ? "text-slate-400 line-through" : ""}`}>
                    {item.label}
                  </span>
                  <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                    {item.type}
                  </span>
                  {item.required && <span className="text-xs text-red-500">required</span>}
                </li>
              ))}
            </ul>
          </Card>

          {/* Assessments */}
          <Card>
            <h3 className="mb-3 font-semibold">Assessments</h3>
            {app.assessments.length === 0 ? (
              <p className="text-sm text-[color:var(--color-muted)]">None recorded.</p>
            ) : (
              <ul className="mb-3 divide-y divide-[color:var(--color-line)]">
                {app.assessments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-medium">{a.name}</span>
                    <span>
                      {a.score !== null ? `${a.score}${a.maxScore ? ` / ${a.maxScore}` : ""}` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canWrite && (
              <form action={recordAssessment} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="applicationId" value={app.id} />
                <input name="name" placeholder="Assessment name" required className={inputCls + " flex-1 min-w-40"} />
                <input name="score" type="number" step="0.1" placeholder="Score" className={inputCls + " w-20"} />
                <input name="maxScore" type="number" step="0.1" placeholder="Max" className={inputCls + " w-20"} />
                <button className={btnGhost}>Add</button>
              </form>
            )}
          </Card>

          {/* Interviews */}
          <Card>
            <h3 className="mb-3 font-semibold">Interviews</h3>
            {app.interviews.length === 0 ? (
              <p className="text-sm text-[color:var(--color-muted)]">None scheduled.</p>
            ) : (
              <ul className="mb-3 divide-y divide-[color:var(--color-line)]">
                {app.interviews.map((iv) => (
                  <li key={iv.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{iv.scheduledAt.toLocaleString()}</span>
                    <Badge tone={iv.status === "COMPLETED" ? "green" : "sky"}>{iv.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {canWrite && (
              <form action={scheduleInterview} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="applicationId" value={app.id} />
                <input name="scheduledAt" type="datetime-local" required className={inputCls} />
                <button className={btnGhost}>Schedule</button>
              </form>
            )}
          </Card>

          {/* Offers */}
          <Card>
            <h3 className="mb-3 font-semibold">Offers</h3>
            {app.offers.length === 0 ? (
              <p className="text-sm text-[color:var(--color-muted)]">No offer issued yet.</p>
            ) : (
              <ul className="mb-3 space-y-2">
                {app.offers.map((o) => (
                  <li key={o.id} className="rounded-lg border border-[color:var(--color-line)] p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Version {o.version}</span>
                      <Badge
                        tone={
                          o.status === "ACCEPTED"
                            ? "green"
                            : o.status === "ISSUED"
                              ? "amber"
                              : "slate"
                        }
                      >
                        {o.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[color:var(--color-muted)]">
                      Deposit ${(o.depositAmount / 100).toLocaleString()}
                      {o.depositPaid ? " (paid)" : ""}
                      {o.deadline ? ` · deadline ${o.deadline.toLocaleDateString()}` : ""}
                    </p>
                    {o.terms && <p className="mt-1">{o.terms}</p>}
                  </li>
                ))}
              </ul>
            )}

            {/* Respond to an outstanding offer */}
            {outstandingOffer && canWrite && (
              <div className="mb-3 flex gap-2">
                <form action={respondOffer}>
                  <input type="hidden" name="applicationId" value={app.id} />
                  <input type="hidden" name="response" value="accept" />
                  <button className={btnPrimary}>Record acceptance</button>
                </form>
                <form action={respondOffer}>
                  <input type="hidden" name="applicationId" value={app.id} />
                  <input type="hidden" name="response" value="decline" />
                  <button className={btnGhost}>Record decline</button>
                </form>
              </div>
            )}

            {/* Issue a (new version) offer */}
            {canDecide && isActive(app.stage) && (
              <form action={issueOffer} className="flex flex-wrap items-end gap-2 border-t border-[color:var(--color-line)] pt-3">
                <input type="hidden" name="applicationId" value={app.id} />
                <div>
                  <label className={labelCls}>Deposit ($)</label>
                  <input name="depositAmount" type="number" step="1" defaultValue="500" className={inputCls + " w-28"} />
                </div>
                <div>
                  <label className={labelCls}>Deadline</label>
                  <input name="deadline" type="date" className={inputCls} />
                </div>
                <button className={btnPrimary}>
                  {app.offers.length ? "Issue new version" : "Issue offer"}
                </button>
              </form>
            )}
          </Card>
        </div>

        {/* Right: actions + timeline */}
        <div className="space-y-4">
          <Card>
            <h3 className="mb-3 font-semibold">Pipeline actions</h3>

            {app.conversion ? (
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                Converted to an enrolled student.{" "}
                <Link href={`/portal/students/${app.conversion.studentId}`} className="font-medium underline">
                  View student
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Advance */}
                {next && !["OFFER", "ENROLLED"].includes(next) && canWrite && (
                  <form action={advanceStage}>
                    <input type="hidden" name="applicationId" value={app.id} />
                    <button className={btnPrimary + " w-full"}>
                      Advance to {STAGE_META[next].label}
                    </button>
                    {requiredIncomplete > 0 &&
                      ["REVIEW"].indexOf(next) >= 0 && (
                        <p className="mt-1 text-xs text-amber-600">
                          {requiredIncomplete} required item(s) must be completed first.
                        </p>
                      )}
                  </form>
                )}

                {/* Convert */}
                {app.stage === "ACCEPTED" && (
                  <form action={convertToEnrolled} className="space-y-3">
                    <input type="hidden" name="applicationId" value={app.id} />
                    {conversionSections.length > 0 ? (
                      <div>
                        <label className={labelCls}>Assign to class</label>
                        <select name="sectionId" required className={inputCls + " w-full"}>
                          <option value="">Select class…</option>
                          {conversionSections.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s._count.enrollments} enrolled)
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600">
                        No classes found for this grade. Create a section first.
                      </p>
                    )}
                    <button
                      disabled={!canConvert || Boolean(limitError) || conversionSections.length === 0}
                      className={btnPrimary + " w-full disabled:opacity-60"}
                    >
                      Convert to enrolled student
                    </button>
                    {!canConvert && (
                      <p className="text-xs text-[color:var(--color-muted)]">
                        Requires conversion rights.
                      </p>
                    )}
                    {canConvert && limitError && (
                      <p className="text-xs text-amber-700">{limitError}</p>
                    )}
                  </form>
                )}

                {/* Side decisions */}
                {isActive(app.stage) && (
                  <div className="space-y-2 border-t border-[color:var(--color-line)] pt-3">
                    {(["WAITLISTED", "REJECTED", "WITHDRAWN"] as const).map((s) => {
                      const canDo =
                        s === "WITHDRAWN" ? canWrite : canDecide;
                      if (!canDo) return null;
                      return (
                        <form key={s} action={setSideStage} className="flex gap-2">
                          <input type="hidden" name="applicationId" value={app.id} />
                          <input type="hidden" name="stage" value={s} />
                          <input
                            name="reason"
                            placeholder="Reason (optional)"
                            className={inputCls + " flex-1"}
                          />
                          <button className={btnGhost}>{STAGE_META[s].label}</button>
                        </form>
                      );
                    })}
                  </div>
                )}

                {/* Re-admit */}
                {(app.stage === "WITHDRAWN" || app.stage === "REJECTED" || app.stage === "ENROLLED") && canWrite && (
                  <div className="border-t border-[color:var(--color-line)] pt-3">
                    <form action={reAdmit}>
                      <input type="hidden" name="applicationId" value={app.id} />
                      <button className={btnGhost + " w-full"}>
                        Re-admit (new application)
                      </button>
                    </form>
                    <p className="mt-1 text-xs text-[color:var(--color-muted)]">
                      Starts a fresh application for the same applicant.
                    </p>
                  </div>
                )}

                {/* Delete application */}
                {(app.stage === "WITHDRAWN" || app.stage === "REJECTED") && canWrite && !app.conversion && (
                  <div className="border-t border-[color:var(--color-line)] pt-3">
                    <form action={deleteApplication}>
                      <input type="hidden" name="applicationId" value={app.id} />
                      <button
                        className="w-full rounded-lg bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100"
                      >
                        Delete application
                      </button>
                    </form>
                    <p className="mt-1 text-xs text-red-500">
                      Permanently removes this application. Cannot be undone.
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold">Stage history</h3>
            <ol className="relative space-y-3 border-l border-[color:var(--color-line)] pl-4">
              {app.stageEvents.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-brand-500" />
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{STAGE_META[e.toStage].label}</span>
                    {e.fromStage && (
                      <span className="text-xs text-[color:var(--color-muted)]">
                        from {STAGE_META[e.fromStage].label}
                      </span>
                    )}
                  </div>
                  {e.reason && (
                    <p className="text-xs text-[color:var(--color-muted)]">{e.reason}</p>
                  )}
                  <p className="text-xs text-[color:var(--color-muted)]">
                    {e.createdAt.toLocaleString()}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[color:var(--color-muted)]">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

const inputCls =
  "rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";
const labelCls = "block text-xs text-[color:var(--color-muted)] mb-1";
const btnPrimary =
  "rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700";
const btnGhost =
  "rounded-lg bg-white px-3.5 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50";
