import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { SUPPORTED_LOCALES } from "@/lib/locales";
import { savePreferences } from "./actions";
import type { NotificationCategory, NotificationChannel } from "@prisma/client";

const CHANNELS: NotificationChannel[] = ["EMAIL", "SMS"];
const CATEGORY_META: { key: NotificationCategory; label: string }[] = [
  { key: "ATTENDANCE", label: "Attendance alerts" },
  { key: "FINANCE", label: "Fee & billing notices" },
  { key: "ACADEMICS", label: "Report cards & results" },
  { key: "ADMISSIONS", label: "Admissions updates" },
  { key: "ANNOUNCEMENT", label: "General announcements" },
];

export default async function PreferencesPage() {
  const ctx = await requireUser();

  if (!ctx.tenantId) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Notification preferences" />
        <Card>
          <p className="text-sm text-[color:var(--color-muted)]">
            Platform staff accounts do not have notification preferences.
          </p>
        </Card>
      </div>
    );
  }

  const [prefs, setting] = await Promise.all([
    prisma.notificationPreference.findMany({ where: { userId: ctx.user.id } }),
    prisma.notificationSetting.findUnique({ where: { userId: ctx.user.id } }),
  ]);
  const prefMap = new Map(prefs.map((p) => [`${p.category}:${p.channel}`, p.enabled]));

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Link href="/portal/messages" className="text-sm text-brand-700 hover:underline">
          ← Messages
        </Link>
      </div>
      <PageHeader
        title="Notification preferences"
        subtitle="In-app notices always arrive. Choose which categories also reach you by email or SMS, and set quiet hours for non-urgent alerts."
      />

      <form action={savePreferences} className="space-y-6">
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                  <th className="px-5 py-3 font-medium">Category</th>
                  {CHANNELS.map((c) => (
                    <th key={c} className="px-5 py-3 text-center font-medium">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORY_META.map((cat) => (
                  <tr key={cat.key} className="border-b border-[color:var(--color-line)] last:border-0">
                    <td className="px-5 py-3 font-medium">{cat.label}</td>
                    {CHANNELS.map((channel) => {
                      const key = `${cat.key}:${channel}`;
                      const checked = prefMap.has(key) ? prefMap.get(key) : true;
                      return (
                        <td key={channel} className="px-5 py-3 text-center">
                          <input
                            type="checkbox"
                            name={`pref:${cat.key}:${channel}`}
                            defaultChecked={checked}
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold">Language</h3>
          <p className="mb-3 text-sm text-[color:var(--color-muted)]">
            Templated notifications are sent in this language when your school has a translation.
          </p>
          <select
            name="locale"
            defaultValue={ctx.user.locale ?? ""}
            className="rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm"
          >
            <option value="">School default</option>
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold">Quiet hours</h3>
          <p className="mb-3 text-sm text-[color:var(--color-muted)]">
            Email and SMS delivery is suppressed during this window (in-app
            notices still arrive). Leave blank to disable quiet hours.
          </p>
          <div className="flex items-center gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-[color:var(--color-muted)]">From (hour)</span>
              <select
                name="quietStart"
                defaultValue={setting?.quietHoursStartHour ?? ""}
                className="rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
            </label>
            <span className="mt-5 text-[color:var(--color-muted)]">to</span>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-[color:var(--color-muted)]">To (hour)</span>
              <select
                name="quietEnd"
                defaultValue={setting?.quietHoursEndHour ?? ""}
                className="rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
            </label>
          </div>
        </Card>

        <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          Save preferences
        </button>
      </form>
    </div>
  );
}
