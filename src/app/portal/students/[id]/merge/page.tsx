import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge } from "@/components/ui";
import { MergeError, previewStudentMerge } from "@/lib/student-merge";
import { confirmMerge, lookupDuplicate } from "../../merge-actions";

export default async function MergeStudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dup?: string; missing?: string; error?: string }>;
}) {
  const ctx = await requireUser();
  const { id } = await params;
  const { dup, missing, error } = await searchParams;

  if (!ctx.tenantId || !can(ctx, "student.merge")) {
    return (
      <Card>
        <p className="text-sm text-[color:var(--color-muted)]">
          Merging student records requires organization-wide rights. Ask an organization owner.
        </p>
      </Card>
    );
  }
  const keep = await prisma.student.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { person: true },
  });
  if (!keep) notFound();

  let preview = null;
  let previewError: string | null = null;
  if (dup) {
    try {
      preview = await previewStudentMerge(ctx.tenantId, id, dup);
    } catch (e) {
      if (!(e instanceof MergeError)) throw e;
      previewError = e.message;
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/portal/students/${id}`} className="text-sm text-brand-700 hover:underline">
        ← Back to student
      </Link>
      <PageHeader
        title="Merge duplicate record"
        subtitle={`Keeping ${keep.person.firstName} ${keep.person.lastName} (${keep.admissionNumber})`}
      />

      <Card>
        <form action={lookupDuplicate} className="flex items-end gap-3">
          <input type="hidden" name="keepId" value={id} />
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-xs text-[color:var(--color-muted)]">
              Admission number of the duplicate to merge away
            </span>
            <input
              name="admissionNumber"
              required
              className="w-full rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm"
            />
          </label>
          <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Preview
          </button>
        </form>
        {missing && <p className="mt-2 text-sm text-red-600">No student with admission number “{missing}”.</p>}
        {previewError && <p className="mt-2 text-sm text-red-600">{previewError}</p>}
      </Card>

      {preview && (
        <Card>
          <h3 className="mb-2 font-semibold">
            {preview.drop.name} ({preview.drop.admissionNumber}) → {preview.keep.name} ({preview.keep.admissionNumber})
          </h3>
          {preview.moving.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">The duplicate has no linked records to move.</p>
          ) : (
            <ul className="mb-3 space-y-1 text-sm">
              {preview.moving.map((m) => (
                <li key={m.label} className="flex justify-between">
                  <span>{m.label}</span>
                  <Badge tone="slate">{m.count}</Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mb-3 text-xs text-[color:var(--color-muted)]">
            If both records hold the same item (e.g. attendance for one session), the kept record’s version
            wins and the duplicate’s is discarded. The duplicate’s admission number is released. This cannot be undone.
          </p>

          {preview.blockers.length > 0 ? (
            <ul className="space-y-1 text-sm text-red-600">
              {preview.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            <form action={confirmMerge} className="space-y-3">
              <input type="hidden" name="keepId" value={id} />
              <input type="hidden" name="dropId" value={dup} />
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-[color:var(--color-muted)]">Reason (recorded in the audit log)</span>
                <input
                  name="reason"
                  required
                  className="w-full rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm"
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
                Merge permanently
              </button>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
