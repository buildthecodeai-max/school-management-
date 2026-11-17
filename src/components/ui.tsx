import Link from "next/link";
import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card p-5 ${className}`}>{children}</div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--color-ink)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

type Tone = "brand" | "green" | "amber" | "red" | "slate" | "sky";

const toneMap: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  green: "bg-green-50 text-green-700 ring-green-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
};

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${toneMap[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  const bar: Record<Tone, string> = {
    brand: "bg-brand-500",
    green: "bg-green-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    slate: "bg-slate-400",
    sky: "bg-sky-500",
  };
  return (
    <div className="card relative overflow-hidden p-5">
      <div className={`absolute left-0 top-0 h-full w-1 ${bar[tone]}`} />
      <p className="text-sm font-medium text-[color:var(--color-muted)]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {hint && (
        <p className="mt-1 text-xs text-[color:var(--color-muted)]">{hint}</p>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-1 p-10 text-center">
      <p className="font-medium">{title}</p>
      {hint && (
        <p className="text-sm text-[color:var(--color-muted)]">{hint}</p>
      )}
    </div>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
}) {
  const styles =
    variant === "primary"
      ? "bg-brand-600 text-white hover:bg-brand-700"
      : "bg-white text-[color:var(--color-ink)] ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50";
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition ${styles}`}
    >
      {children}
    </Link>
  );
}
