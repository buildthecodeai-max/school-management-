import Link from "next/link";
import { canForCampus, canOnAll, requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { preferredCampusId, resolveCampusId } from "@/lib/campus-preference";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { DEFAULT_BANDS } from "@/lib/grade-bands";
import * as A from "./actions";

export const metadata = { title: "Academic configuration" };

const TABS = [
  { key: "years", label: "Academic years", scope: "campus" },
  { key: "terms", label: "Terms", scope: "campus" },
  { key: "grades", label: "Grades", scope: "campus" },
  { key: "sections", label: "Sections", scope: "campus" },
  { key: "subjects", label: "Subjects", scope: "campus" },
  { key: "rooms", label: "Rooms", scope: "campus" },
  { key: "scales", label: "Grade scales", scope: "tenant" },
  { key: "codes", label: "Attendance codes", scope: "tenant" },
  { key: "leave", label: "Leave types", scope: "tenant" },
  { key: "departments", label: "Departments & positions", scope: "campus" },
] as const;

const fmt = (d: Date) => d.toISOString().slice(0, 10);
const Row = ({ children }: { children: React.ReactNode }) => (
  <li className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--color-line)] py-3 last:border-0">{children}</li>
);
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className={labelCls}>{label}</label>
    {children}
  </div>
);
const Edit = ({ children }: { children: React.ReactNode }) => (
  <details className="w-full">
    <summary className="cursor-pointer text-sm text-brand-700">Edit</summary>
    <div className="mt-2 rounded-md bg-slate-50 p-3">{children}</div>
  </details>
);
const Del = ({ action, id, campusId, text }: { action: A.CfgActionType; id: string; campusId?: string; text: string }) => (
  <ActionForm action={action} submit="Delete" variant="danger" confirmText={text} className="inline">
    <input type="hidden" name="id" value={id} />
    {campusId && <input type="hidden" name="campusId" value={campusId} />}
  </ActionForm>
);

export default async function ConfigPage({ searchParams }: { searchParams: Promise<{ campusId?: string; tab?: string }> }) {
  const ctx = await requirePermission("academics.read");
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];

  const campuses = await prisma.campus.findMany({ where: { tenantId: ctx.tenantId!, status: { not: "CLOSED" } }, orderBy: { name: "asc" } });
  const accessible = campuses.filter((c) => canForCampus(ctx, "academics.read", c.id));
  const campusId = resolveCampusId(sp.campusId, await preferredCampusId(ctx, "academics.read"), accessible);
  if (!campusId) return <EmptyState title="No campus in your scope" />;

  const permFor = tab.key === "departments" ? "hr.staff.write" : tab.key === "codes" ? "attendance.write" : tab.key === "leave" ? "hr.staff.write" : tab.key === "scales" ? "exams.manage" : "academics.write";
  const canWrite =
    tab.scope === "tenant" ? canOnAll(ctx, permFor, campuses.map((c) => c.id)) : canForCampus(ctx, permFor, campusId);
  const q = (t: string) => `/portal/academics/config?campusId=${campusId}&tab=${t}`;
  const hidden = <input type="hidden" name="campusId" value={campusId} />;

  const where = { tenantId: ctx.tenantId!, campusId };
  const [years, grades, staff] = await Promise.all([
    prisma.academicYear.findMany({ where, orderBy: { startDate: "desc" }, include: { terms: { orderBy: { startDate: "asc" } } } }),
    prisma.gradeLevel.findMany({ where, orderBy: [{ rank: "asc" }, { name: "asc" }] }),
    tab.key === "sections"
      ? prisma.staff.findMany({ where: { tenantId: ctx.tenantId!, employmentRecords: { some: { campusId, endDate: null } } }, include: { person: true }, orderBy: { person: { lastName: "asc" } } })
      : Promise.resolve([]),
  ]);

  let body: React.ReactNode = null;

  if (tab.key === "years") {
    body = (
      <>
        {canWrite && (
          <Card className="mb-4">
            <ActionForm action={A.createAcademicYear} submit="Add academic year" className="space-y-3">
              {hidden}
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Name"><input name="name" required placeholder="2026–27" className={inputCls} /></Field>
                <Field label="Starts"><input name="startDate" type="date" required className={inputCls} /></Field>
                <Field label="Ends"><input name="endDate" type="date" required className={inputCls} /></Field>
                <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" name="isCurrent" /> Make current</label>
              </div>
            </ActionForm>
          </Card>
        )}
        {years.length === 0 ? <EmptyState title="No academic years yet" hint="Create the first one to start configuring terms, sections and enrollment." /> : (
          <Card><ul>{years.map((y) => (
            <Row key={y.id}>
              <div><span className="font-medium">{y.name}</span> {y.isCurrent && <Badge tone="green">Current</Badge>}
                <p className="text-sm text-[color:var(--color-muted)]">{fmt(y.startDate)} to {fmt(y.endDate)} · {y.terms.length} term(s)</p></div>
              {canWrite && (
                <div className="flex items-center gap-2">
                  {!y.isCurrent && <ActionForm action={A.setCurrentAcademicYear} submit="Make current" variant="ghost" className="inline"><input type="hidden" name="id" value={y.id} /></ActionForm>}
                  <Del action={A.deleteAcademicYear} id={y.id} text={`Delete ${y.name}?`} />
                </div>
              )}
              {canWrite && <Edit><ActionForm action={A.updateAcademicYear} submit="Save" className="grid gap-3 sm:grid-cols-4">
                <input type="hidden" name="id" value={y.id} />
                <Field label="Name"><input name="name" defaultValue={y.name} className={inputCls} /></Field>
                <Field label="Starts"><input name="startDate" type="date" defaultValue={fmt(y.startDate)} className={inputCls} /></Field>
                <Field label="Ends"><input name="endDate" type="date" defaultValue={fmt(y.endDate)} className={inputCls} /></Field>
              </ActionForm></Edit>}
            </Row>))}</ul></Card>
        )}
      </>
    );
  } else if (tab.key === "terms") {
    body = (
      <>
        {canWrite && years.length > 0 && (
          <Card className="mb-4">
            <ActionForm action={A.createTerm} submit="Add term" className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Academic year"><select name="academicYearId" className={inputCls}>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></Field>
                <Field label="Name"><input name="name" required placeholder="Term 1" className={inputCls} /></Field>
                <Field label="Starts"><input name="startDate" type="date" required className={inputCls} /></Field>
                <Field label="Ends"><input name="endDate" type="date" required className={inputCls} /></Field>
              </div>
            </ActionForm>
          </Card>
        )}
        {years.length === 0 ? <EmptyState title="Create an academic year first" hint="Terms belong to an academic year." /> : years.map((y) => (
          <Card key={y.id} className="mb-3"><h3 className="mb-1 font-semibold">{y.name}</h3>
            {y.terms.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">No terms.</p> : <ul>{y.terms.map((t) => (
              <Row key={t.id}>
                <div><span className="font-medium">{t.name}</span><p className="text-sm text-[color:var(--color-muted)]">{fmt(t.startDate)} to {fmt(t.endDate)}</p></div>
                {canWrite && <Del action={A.deleteTerm} id={t.id} text={`Delete ${t.name}?`} />}
                {canWrite && <Edit><ActionForm action={A.updateTerm} submit="Save" className="grid gap-3 sm:grid-cols-3">
                  <input type="hidden" name="id" value={t.id} />
                  <Field label="Name"><input name="name" defaultValue={t.name} className={inputCls} /></Field>
                  <Field label="Starts"><input name="startDate" type="date" defaultValue={fmt(t.startDate)} className={inputCls} /></Field>
                  <Field label="Ends"><input name="endDate" type="date" defaultValue={fmt(t.endDate)} className={inputCls} /></Field>
                </ActionForm></Edit>}
              </Row>))}</ul>}
          </Card>))}
      </>
    );
  } else if (tab.key === "grades") {
    body = (
      <>
        {canWrite && <Card className="mb-4"><ActionForm action={A.createGradeLevel} submit="Add grade" className="grid gap-3 sm:grid-cols-3">
          {hidden}
          <Field label="Name"><input name="name" required placeholder="Grade 1" className={inputCls} /></Field>
          <Field label="Order (progression)"><input name="rank" type="number" min={0} defaultValue={grades.length + 1} className={inputCls} /></Field>
        </ActionForm></Card>}
        {grades.length === 0 ? <EmptyState title="No grades yet" hint="Grades define the progression students are promoted through." /> : (
          <Card><ul>{grades.map((g) => (
            <Row key={g.id}>
              <div><span className="font-medium">{g.name}</span> <span className="text-sm text-[color:var(--color-muted)]">order {g.rank}</span></div>
              {canWrite && <Del action={A.deleteGradeLevel} id={g.id} text={`Delete ${g.name}?`} />}
              {canWrite && <Edit><ActionForm action={A.updateGradeLevel} submit="Save" className="grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="id" value={g.id} />
                <Field label="Name"><input name="name" defaultValue={g.name} className={inputCls} /></Field>
                <Field label="Order"><input name="rank" type="number" min={0} defaultValue={g.rank} className={inputCls} /></Field>
              </ActionForm></Edit>}
            </Row>))}</ul></Card>)}
      </>
    );
  } else if (tab.key === "sections") {
    const sections = await prisma.section.findMany({
      where, orderBy: [{ gradeLevel: { rank: "asc" } }, { name: "asc" }],
      include: { gradeLevel: true, academicYear: true, homeroomStaff: { include: { person: true } }, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
    });
    const teacherSelect = (current?: string | null) => (
      <select name="homeroomStaffId" defaultValue={current ?? ""} className={inputCls}>
        <option value="">None</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.person.firstName} {s.person.lastName}</option>)}
      </select>
    );
    body = (
      <>
        {canWrite && (grades.length === 0 || years.length === 0 ? <EmptyState title="Create a grade and an academic year first" /> : (
          <Card className="mb-4"><ActionForm action={A.createSection} submit="Add section" className="space-y-3">
            {hidden}
            <div className="grid gap-3 sm:grid-cols-5">
              <Field label="Grade"><select name="gradeLevelId" className={inputCls}>{grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
              <Field label="Academic year"><select name="academicYearId" defaultValue={years.find((y) => y.isCurrent)?.id} className={inputCls}>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></Field>
              <Field label="Name"><input name="name" required placeholder="A" className={inputCls} /></Field>
              <Field label="Capacity"><input name="capacity" type="number" min={1} defaultValue={40} className={inputCls} /></Field>
              <Field label="Class teacher">{teacherSelect()}</Field>
            </div>
          </ActionForm></Card>))}
        {sections.length === 0 ? <EmptyState title="No sections yet" /> : (
          <Card><ul>{sections.map((s) => (
            <Row key={s.id}>
              <div><span className="font-medium">{s.gradeLevel.name} · {s.name}</span> <span className="text-sm text-[color:var(--color-muted)]">{s.academicYear.name}</span>
                <p className="text-sm text-[color:var(--color-muted)]">{s._count.enrollments}/{s.capacity} enrolled · {s.homeroomStaff ? `${s.homeroomStaff.person.firstName} ${s.homeroomStaff.person.lastName}` : "No class teacher"}</p></div>
              {canWrite && <Del action={A.deleteSection} id={s.id} text={`Delete section ${s.name}?`} />}
              {canWrite && <Edit><ActionForm action={A.updateSection} submit="Save" className="grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="id" value={s.id} />
                <Field label="Name"><input name="name" defaultValue={s.name} className={inputCls} /></Field>
                <Field label="Capacity"><input name="capacity" type="number" min={1} defaultValue={s.capacity} className={inputCls} /></Field>
                <Field label="Class teacher">{teacherSelect(s.homeroomStaffId)}</Field>
              </ActionForm></Edit>}
            </Row>))}</ul></Card>)}
      </>
    );
  } else if (tab.key === "subjects") {
    const subjects = await prisma.subject.findMany({ where: { tenantId: ctx.tenantId!, campusId }, orderBy: { name: "asc" } });
    body = (
      <>
        {canWrite && <Card className="mb-4"><ActionForm action={A.createSubject} submit="Add subject" className="grid gap-3 sm:grid-cols-3">
          {hidden}
          <Field label="Code"><input name="code" required placeholder="MATH" className={inputCls} /></Field>
          <Field label="Name"><input name="name" required placeholder="Mathematics" className={inputCls} /></Field>
        </ActionForm></Card>}
        {subjects.length === 0 ? <EmptyState title="No subjects yet" hint="Subjects are used by assessments, timetables and teaching assignments." /> : (
          <Card><ul>{subjects.map((s) => (
            <Row key={s.id}>
              <div><span className="font-medium">{s.name}</span> <code className="text-xs text-[color:var(--color-muted)]">{s.code}</code></div>
              {canWrite && <Del action={A.deleteSubject} id={s.id} text={`Delete ${s.name}?`} />}
              {canWrite && <Edit><ActionForm action={A.updateSubject} submit="Save" className="grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="id" value={s.id} />
                <Field label="Code"><input name="code" defaultValue={s.code} className={inputCls} /></Field>
                <Field label="Name"><input name="name" defaultValue={s.name} className={inputCls} /></Field>
              </ActionForm></Edit>}
            </Row>))}</ul></Card>)}
      </>
    );
  } else if (tab.key === "rooms") {
    const rooms = await prisma.room.findMany({ where, orderBy: { code: "asc" } });
    const typeSel = (cur?: string) => (
      <select name="roomType" defaultValue={cur ?? "CLASSROOM"} className={inputCls}>
        {["CLASSROOM", "LAB", "LIBRARY", "HALL", "SPORTS", "OTHER"].map((t) => <option key={t}>{t}</option>)}
      </select>
    );
    body = (
      <>
        {canWrite && <Card className="mb-4"><ActionForm action={A.createRoom} submit="Add room" className="grid gap-3 sm:grid-cols-4">
          {hidden}
          <Field label="Code"><input name="code" required placeholder="R-101" className={inputCls} /></Field>
          <Field label="Name"><input name="name" placeholder="Room 101" className={inputCls} /></Field>
          <Field label="Capacity"><input name="capacity" type="number" min={1} defaultValue={30} className={inputCls} /></Field>
          <Field label="Type">{typeSel()}</Field>
        </ActionForm></Card>}
        {rooms.length === 0 ? <EmptyState title="No rooms yet" hint="Rooms are used by the timetable and exam scheduling." /> : (
          <Card><ul>{rooms.map((r) => (
            <Row key={r.id}>
              <div><span className="font-medium">{r.name}</span> <code className="text-xs text-[color:var(--color-muted)]">{r.code}</code> <Badge tone="slate">{r.roomType}</Badge>
                <p className="text-sm text-[color:var(--color-muted)]">Capacity {r.capacity}</p></div>
              {canWrite && <Del action={A.deleteRoom} id={r.id} text={`Delete room ${r.code}?`} />}
              {canWrite && <Edit><ActionForm action={A.updateRoom} submit="Save" className="grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="id" value={r.id} />
                <Field label="Name"><input name="name" defaultValue={r.name} className={inputCls} /></Field>
                <Field label="Capacity"><input name="capacity" type="number" min={1} defaultValue={r.capacity} className={inputCls} /></Field>
                <Field label="Type">{typeSel(r.roomType)}</Field>
              </ActionForm></Edit>}
            </Row>))}</ul></Card>)}
      </>
    );
  } else if (tab.key === "scales") {
    const scales = await prisma.gradeScale.findMany({ where: { tenantId: ctx.tenantId! }, include: { bands: { orderBy: { minPercent: "desc" } } }, orderBy: { name: "asc" } });
    body = (
      <>
        {canWrite ? <Card className="mb-4"><ActionForm action={A.createGradeScale} submit="Add grade scale" className="space-y-3">
          <Field label="Name"><input name="name" required placeholder="Standard A–F" className={inputCls} /></Field>
          <Field label="Bands (one per line: grade, minimum %, grade points, pass or fail)"><textarea name="bands" rows={6} defaultValue={DEFAULT_BANDS} className={`${inputCls} font-mono`} /></Field>
        </ActionForm></Card> : <p className="mb-4 text-sm text-[color:var(--color-muted)]">Grade scales apply to every campus, so changing them needs academic rights on all campuses.</p>}
        {scales.length === 0 ? <EmptyState title="No grade scales yet" hint="Assessment plans need a grade scale to convert percentages to grades." /> : (
          <Card><ul>{scales.map((s) => (
            <Row key={s.id}>
              <div><span className="font-medium">{s.name}</span>
                <p className="text-sm text-[color:var(--color-muted)]">{s.bands.map((b) => `${b.grade} ≥${b.minPercent}%${b.isPass ? "" : " (fail)"}`).join(" · ")}</p></div>
              {canWrite && <Del action={A.deleteGradeScale} id={s.id} text={`Delete ${s.name}?`} />}
            </Row>))}</ul></Card>)}
      </>
    );
  } else if (tab.key === "codes") {
    const codes = await prisma.attendanceCode.findMany({ where: { tenantId: ctx.tenantId! }, orderBy: { code: "asc" } });
    const catSel = (cur?: string) => (
      <select name="category" defaultValue={cur ?? "PRESENT"} className={inputCls}>{["PRESENT", "ABSENT", "LATE", "EXCUSED", "LEAVE", "REMOTE"].map((c) => <option key={c}>{c}</option>)}</select>
    );
    body = (
      <>
        {canWrite ? <Card className="mb-4"><ActionForm action={A.createAttendanceCode} submit="Add code" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Code"><input name="code" required maxLength={4} placeholder="P" className={inputCls} /></Field>
            <Field label="Label"><input name="label" required placeholder="Present" className={inputCls} /></Field>
            <Field label="Category">{catSel()}</Field>
          </div>
          <div className="flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" name="countsAsPresent" /> Counts as present</label><label className="flex items-center gap-2"><input type="checkbox" name="notifyGuardian" /> Notify guardian</label></div>
        </ActionForm></Card> : <p className="mb-4 text-sm text-[color:var(--color-muted)]">Attendance codes apply to every campus, so changing them needs attendance rights on all campuses.</p>}
        {codes.length === 0 ? <EmptyState title="No attendance codes yet" hint="Registers cannot be taken until at least one code exists." /> : (
          <Card><ul>{codes.map((c) => (
            <Row key={c.id}>
              <div><code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm font-semibold">{c.code}</code> <span className="font-medium">{c.label}</span> <Badge tone="slate">{c.category}</Badge>
                <p className="text-sm text-[color:var(--color-muted)]">{c.countsAsPresent ? "Counts as present" : "Does not count as present"} · {c.notifyGuardian ? "Notifies guardian" : "No guardian alert"}</p></div>
              {canWrite && <Del action={A.deleteAttendanceCode} id={c.id} text={`Delete code ${c.code}?`} />}
              {canWrite && <Edit><ActionForm action={A.updateAttendanceCode} submit="Save" className="space-y-3">
                <input type="hidden" name="id" value={c.id} />
                <div className="grid gap-3 sm:grid-cols-2"><Field label="Label"><input name="label" defaultValue={c.label} className={inputCls} /></Field><Field label="Category">{catSel(c.category)}</Field></div>
                <div className="flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" name="countsAsPresent" defaultChecked={c.countsAsPresent} /> Counts as present</label><label className="flex items-center gap-2"><input type="checkbox" name="notifyGuardian" defaultChecked={c.notifyGuardian} /> Notify guardian</label></div>
              </ActionForm></Edit>}
            </Row>))}</ul></Card>)}
      </>
    );
  } else if (tab.key === "leave") {
    const types = await prisma.leaveType.findMany({ where: { tenantId: ctx.tenantId! }, orderBy: { name: "asc" } });
    body = (
      <>
        {canWrite ? <Card className="mb-4"><ActionForm action={A.createLeaveType} submit="Add leave type" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name"><input name="name" required placeholder="Annual leave" className={inputCls} /></Field>
            <Field label="Days per year"><input name="daysPerYear" type="number" min={0} step="0.5" defaultValue={0} className={inputCls} /></Field>
            <Field label="Applies to"><select name="appliesTo" className={inputCls}><option>STAFF</option><option>STUDENT</option><option>BOTH</option></select></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPaid" defaultChecked /> Paid leave</label>
        </ActionForm></Card> : <p className="mb-4 text-sm text-[color:var(--color-muted)]">Leave types apply to every campus, so changing them needs HR rights on all campuses.</p>}
        {types.length === 0 ? <EmptyState title="No leave types yet" hint="Staff cannot request leave until a leave type exists." /> : (
          <Card><ul>{types.map((t) => (
            <Row key={t.id}>
              <div><span className="font-medium">{t.name}</span> <Badge tone="slate">{t.appliesTo}</Badge>
                <p className="text-sm text-[color:var(--color-muted)]">{t.daysPerYear} day(s) a year · {t.isPaid ? "Paid" : "Unpaid"}</p></div>
              {canWrite && <Del action={A.deleteLeaveType} id={t.id} text={`Delete ${t.name}?`} />}
            </Row>))}</ul></Card>)}
      </>
    );
  } else {
    const deps = await prisma.department.findMany({ where, orderBy: { name: "asc" }, include: { positions: { orderBy: { title: "asc" } } } });
    body = (
      <>
        {canWrite && (
          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <Card><ActionForm action={A.createDepartment} submit="Add department" className="space-y-3">
              {hidden}
              <Field label="Department"><input name="name" required placeholder="Mathematics" className={inputCls} /></Field>
            </ActionForm></Card>
            {deps.length > 0 && <Card><ActionForm action={A.createPosition} submit="Add position" className="space-y-3">
              <Field label="Department"><select name="departmentId" className={inputCls}>{deps.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
              <Field label="Position title"><input name="title" required placeholder="Senior teacher" className={inputCls} /></Field>
            </ActionForm></Card>}
          </div>
        )}
        {deps.length === 0 ? <EmptyState title="No departments yet" hint="Positions belong to a department and are needed to add staff and hire applicants." /> : deps.map((d) => (
          <Card key={d.id} className="mb-3">
            <div className="flex items-center justify-between"><h3 className="font-semibold">{d.name}</h3>{canWrite && <Del action={A.deleteDepartment} id={d.id} text={`Delete ${d.name}?`} />}</div>
            {d.positions.length === 0 ? <p className="mt-1 text-sm text-[color:var(--color-muted)]">No positions.</p> : <ul>{d.positions.map((p) => (
              <Row key={p.id}><span>{p.title}</span>{canWrite && <Del action={A.deletePosition} id={p.id} text={`Delete ${p.title}?`} />}</Row>))}</ul>}
          </Card>))}
      </>
    );
  }

  return (
    <div className="space-y-5">
      <div><Link href="/portal/academics" className="text-sm text-brand-700 hover:underline">← Academics</Link></div>
      <PageHeader title="Academic configuration" subtitle="Set up the structure the rest of the school runs on: years, terms, grades, sections, subjects, rooms, grading and staff structure." />
      <div className="flex flex-wrap gap-2">
        {accessible.map((c) => (
          <Link key={c.id} href={`/portal/academics/config?campusId=${c.id}&tab=${tab.key}`}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${c.id === campusId ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-300 hover:bg-gray-50"}`}>{c.name}</Link>
        ))}
      </div>
      <nav className="flex flex-wrap gap-x-4 gap-y-1 border-b border-[color:var(--color-line)]">
        {TABS.map((t) => (
          <Link key={t.key} href={q(t.key)} className={`border-b-2 pb-2 text-sm font-medium ${t.key === tab.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>{t.label}</Link>
        ))}
      </nav>
      {!canWrite && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">You can view this configuration but not change it.</p>}
      {body}
    </div>
  );
}
