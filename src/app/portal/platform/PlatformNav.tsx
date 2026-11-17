"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/portal/platform", label: "Tenants" },
  { href: "/portal/platform/plans", label: "Plans" },
  { href: "/portal/platform/audit", label: "Audit log" },
];

export function PlatformNav() {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex gap-5 border-b border-[color:var(--color-line)]">
      {TABS.map((t) => {
        const active =
          t.href === "/portal/platform"
            ? pathname === t.href || pathname.startsWith("/portal/platform/tenants")
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 pb-2 text-sm font-medium ${
              active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
