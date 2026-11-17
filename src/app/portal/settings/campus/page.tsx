import { requirePermission, canForCampus, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import {
  SETTING_DEFS,
  SETTING_KEYS,
  effectiveSettings,
  type EffectiveSetting,
} from "@/lib/settings";
import { OrgSettingRow, CampusSettingRow } from "./SettingsForms";

export const metadata = { title: "Settings" };

const GROUP_ORDER = ["Numbering", "Fees", "Attendance", "Exams", "Library", "Inventory"];

function groupBy(list: EffectiveSetting[]) {
  const g = new Map<string, EffectiveSetting[]>();
  for (const s of list) {
    (g.get(s.def.group) ?? g.set(s.def.group, []).get(s.def.group)!).push(s);
  }
  return [...g.entries()].sort(
    (a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]),
  );
}

export default async function CampusSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const ctx = await requirePermission("org.settings.read");
  const { scope } = await searchParams;

  const campuses = await prisma.campus.findMany({
    where: { tenantId: ctx.tenantId!, status: { not: "CLOSED" } },
    orderBy: { name: "asc" },
  });

  const canOrg = can(ctx, "org.settings.write");
  // "org" tab, or a campus id. Default to org for org-wide roles, else first
  // campus the user can read.
  const readableCampus = campuses.find((c) => canForCampus(ctx, "org.settings.read", c.id));
  const activeScope = scope ?? (canOrg ? "org" : readableCampus?.id) ?? "org";
  const activeCampus = campuses.find((c) => c.id === activeScope) ?? null;

  const eff = activeCampus
    ? await effectiveSettings(ctx.tenantId!, activeCampus.id)
    : await effectiveSettings(ctx.tenantId!);
  const rows = SETTING_KEYS.map((k) => eff[k]);

  // Compare-across-campuses strip (BRN-003): effective value of each key per campus.
  const perCampus = await Promise.all(
    campuses.map(async (c) => ({
      campus: c,
      eff: await effectiveSettings(ctx.tenantId!, c.id),
    })),
  );

  const canWriteActiveCampus = activeCampus
    ? canForCampus(ctx, "org.settings.write", activeCampus.id)
    : false;

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Organization defaults inherit down to every campus. Lock a value to prevent per-campus overrides."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {canOrg && (
          <a
            href="?scope=org"
            className={`rounded-full border px-3 py-1 text-sm font-medium ${
              activeScope === "org"
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-[color:var(--color-line)] hover:bg-slate-50"
            }`}
          >
            Organization
          </a>
        )}
        {campuses.map((c) => (
          <a
            key={c.id}
            href={`?scope=${c.id}`}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${
              c.id === activeScope
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-[color:var(--color-line)] hover:bg-slate-50"
            }`}
          >
            {c.name}
          </a>
        ))}
      </div>

      {!activeCampus ? (
        <Card>
          <h3 className="mb-1 font-semibold">Organization defaults</h3>
          <p className="mb-4 text-sm text-[color:var(--color-muted)]">
            These apply to every campus unless a campus sets its own value. A locked
            setting cannot be overridden.
          </p>
          {groupBy(rows).map(([group, items]) => (
            <div key={group} className="mb-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
                {group}
              </p>
              {items.map((s) => (
                <OrgSettingRow key={s.key} s={s} />
              ))}
            </div>
          ))}
        </Card>
      ) : (
        <Card>
          <h3 className="mb-1 font-semibold">{activeCampus.name}</h3>
          <p className="mb-4 text-sm text-[color:var(--color-muted)]">
            Effective value and where it comes from. Set a value to override the
            organization default; clear it to inherit again.
          </p>
          {groupBy(rows).map(([group, items]) => (
            <div key={group} className="mb-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
                {group}
              </p>
              {items.map((s) => (
                <CampusSettingRow
                  key={s.key}
                  s={s}
                  campusId={activeCampus.id}
                  canWrite={canWriteActiveCampus}
                />
              ))}
            </div>
          ))}
        </Card>
      )}

      {campuses.length > 1 && (
        <Card className="mt-6 p-0">
          <h3 className="px-5 pt-4 font-semibold">Effective values across campuses</h3>
          <div className="overflow-x-auto p-5 pt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                  <th className="py-2 pr-4 font-medium">Setting</th>
                  {campuses.map((c) => (
                    <th key={c.id} className="px-3 py-2 font-medium">{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SETTING_KEYS.map((k) => (
                  <tr key={k} className="border-b border-[color:var(--color-line)] last:border-0">
                    <td className="py-2 pr-4">{SETTING_DEFS[k].label}</td>
                    {perCampus.map(({ campus, eff }) => {
                      const s = eff[k];
                      const tone =
                        s.source === "campus"
                          ? "font-medium text-brand-700"
                          : s.source === "default"
                            ? "text-[color:var(--color-muted)]"
                            : "";
                      return (
                        <td key={campus.id} className={`px-3 py-2 tabular-nums ${tone}`}>
                          {s.value || "—"}
                          {s.locked && <span title="locked at organization"> 🔒</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
