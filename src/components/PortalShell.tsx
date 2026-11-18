import Link from "next/link";
import { cookies } from "next/headers";
import { leaveOrganization } from "@/app/portal/platform/context-actions";
import { prisma } from "@/lib/db";
import { preferredCampusId } from "@/lib/campus-preference";
import { CampusSwitcher } from "./CampusSwitcher";
import { BreachWarningBanner } from "./BreachWarningBanner";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  CalendarCheck,
  GraduationCap,
  Building2,
  Bell,
  ShieldCheck,
  CreditCard,
  Receipt,
  Landmark,
  ClipboardCheck,
  Rocket,
  Plug,
  LogOut,
  BookOpen,
  Briefcase,
  Library,
  Bus,
  Package,
  Heart,
  AlertTriangle,
  Layers,
  History,
} from "lucide-react";
import type { AuthzContext } from "@/lib/rbac";
import { can } from "@/lib/rbac";
import { destroySession, endImpersonation, getSessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { PermissionKey } from "@/lib/permissions";

async function logoutAction() {
  "use server";
  await destroySession();
  redirect("/login");
}

async function endImpersonationAction() {
  "use server";
  // Capture who/what before swapping the session cookie back.
  const before = await getSessionUser();
  const ended = await endImpersonation();
  if (ended && before?.impersonatedByUserId) {
    await audit({
      tenantId: before.tenantId,
      actorUserId: before.impersonatedByUserId,
      action: "iam.impersonation.end",
      targetType: "User",
      targetId: before.id,
      scopeType: "PLATFORM",
    });
  }
  redirect(ended ? "/portal/platform" : "/portal");
}

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  perm?: PermissionKey;
  platformOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/portal", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  {
    href: "/portal/platform",
    label: "Tenants",
    icon: <ShieldCheck size={18} />,
    platformOnly: true,
  },
  {
    href: "/portal/platform/plans",
    label: "Plans",
    icon: <Layers size={18} />,
    platformOnly: true,
  },
  {
    href: "/portal/platform/audit",
    label: "Audit log",
    icon: <History size={18} />,
    platformOnly: true,
  },
  {
    href: "/portal/admissions",
    label: "Admissions",
    icon: <UserPlus size={18} />,
    perm: "admissions.read",
  },
  {
    href: "/portal/students",
    label: "Students",
    icon: <Users size={18} />,
    perm: "student.read",
  },
  {
    href: "/portal/attendance",
    label: "Attendance",
    icon: <CalendarCheck size={18} />,
    perm: "attendance.read",
  },
  {
    href: "/portal/academics",
    label: "Academics",
    icon: <GraduationCap size={18} />,
    perm: "academics.read",
  },
  {
    href: "/portal/exams",
    label: "Assessment",
    icon: <ClipboardCheck size={18} />,
    perm: "exams.read",
  },
  {
    href: "/portal/fees",
    label: "Fees",
    icon: <Receipt size={18} />,
    perm: "fee.read",
  },
  {
    href: "/portal/finance",
    label: "Finance",
    icon: <Landmark size={18} />,
    perm: "finance.read",
  },
  {
    href: "/portal/campuses",
    label: "Campuses",
    icon: <Building2 size={18} />,
    perm: "campus.read",
  },
  {
    href: "/portal/setup",
    label: "Setup",
    icon: <Rocket size={18} />,
    perm: "setup.read",
  },
  {
    href: "/portal/integrations",
    label: "Integrations",
    icon: <Plug size={18} />,
    perm: "integrations.manage",
  },
  {
    href: "/portal/billing",
    label: "Subscription",
    icon: <CreditCard size={18} />,
    perm: "billing.read",
  },
  {
    href: "/portal/hr",
    label: "HR",
    icon: <Briefcase size={18} />,
    perm: "hr.staff.read",
  },
  {
    href: "/portal/library",
    label: "Library",
    icon: <Library size={18} />,
    perm: "library.read",
  },
  {
    href: "/portal/transport",
    label: "Transport",
    icon: <Bus size={18} />,
    perm: "transport.read",
  },
  {
    href: "/portal/inventory",
    label: "Inventory",
    icon: <Package size={18} />,
    perm: "inventory.read",
  },
  {
    href: "/portal/health",
    label: "Health",
    icon: <Heart size={18} />,
    perm: "health.record.read",
  },
  {
    href: "/portal/safeguarding",
    label: "Safeguarding",
    icon: <AlertTriangle size={18} />,
    perm: "safeguarding.case.read",
  },
  {
    href: "/portal/messages",
    label: "Messages",
    icon: <Bell size={18} />,
    perm: "message.read",
  },
  {
    href: "/portal/calendar",
    label: "Calendar",
    icon: <CalendarCheck size={18} />,
    perm: "calendar.read",
  },
  { href: "/portal/certificates", label: "Certificates", icon: <GraduationCap size={18} />, perm: "student.write" },
  { href: "/portal/hostel", label: "Hostel", icon: <Building2 size={18} />, perm: "student.write" },
  { href: "/portal/reports", label: "Reports", icon: <ClipboardCheck size={18} /> },
];

export async function PortalShell({
  ctx,
  children,
}: {
  ctx: AuthzContext;
  children: ReactNode;
}) {
  const user = ctx.user;
  const items = NAV.filter((item) => {
    if (item.platformOnly) return ctx.isPlatformStaff;
    // Tenant-scoped destinations are unreachable without a tenant row, so
    // platform staff only see the platform console entries.
    if (!ctx.tenantId) return false;
    if (!item.perm) return true;
    // show if held org-wide or on any campus
    return can(ctx, item.perm) || ctx.campusPermissions.size > 0
      ? can(ctx, item.perm) ||
          [...ctx.campusPermissions.values()].some((s) => s.has(item.perm!))
      : false;
  });

  const roleNames = [
    ...new Set(user.roleAssignments.map((a) => a.role.name)),
  ].join(", ");

  const contextLabel = ctx.isPlatformStaff
    ? (user.tenant ? `Platform operator · ${user.tenant.name}` : "Platform operator")
    : user.tenant?.name ?? "Organization";

  // Campuses this user may switch between: every campus in the tenant for an
  // org-wide role, otherwise only those they hold an assignment on.
  const switchableCampuses = ctx.tenantId
    ? await prisma.campus.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: { not: "CLOSED" },
          ...(ctx.hasOrgScope ? {} : { id: { in: ctx.campusIds } }),
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];
  const activeCampusId = await preferredCampusId(ctx, "campus.read");
  const jar = await cookies();
  const showBreachWarning = jar.get("sms_pwd_breach")?.value === "1";

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[color:var(--color-line)] bg-white md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-[color:var(--color-line)] px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <BookOpen size={18} />
          </div>
          <span className="text-lg font-semibold tracking-tight">Scholarum</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-brand-50 hover:text-brand-700"
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-[color:var(--color-line)] p-3">
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-700"
            >
              <LogOut size={18} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-16 items-center justify-between border-b border-[color:var(--color-line)] bg-white px-6">
          <div className="flex min-w-0 items-center gap-3 text-sm">
            <Building2 size={16} className="shrink-0 text-brand-600" />
            <span className="truncate font-medium">{contextLabel}</span>
            {ctx.isPlatformStaff && ctx.tenantId && (
              <form action={leaveOrganization}><button className="text-sm text-brand-700 underline">Return to platform</button></form>
            )}
            {ctx.isPlatformStaff && ctx.tenantId && (
              <Link href={`/portal/platform/tenants/${ctx.tenantId}`} className="text-sm text-brand-700 underline">Users and roles / change campus</Link>
            )}
            {ctx.isPlatformStaff && ctx.tenantId && <span>{ctx.operatorCampusId ? switchableCampuses.find(c => c.id === ctx.operatorCampusId)?.name : "All campuses"}</span>}
            {!ctx.isPlatformStaff && ctx.tenantId && switchableCampuses.length > 0 && (
              <CampusSwitcher
                campuses={switchableCampuses}
                current={activeCampusId}
                allowOrgWide={ctx.hasOrgScope}
              />
            )}
            {ctx.tenantId && switchableCampuses.length === 0 && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                no campus access
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {ctx.tenantId && (
              <form action="/portal/search" className="hidden sm:block">
                <label htmlFor="global-search" className="sr-only">
                  Search students, staff and applicants
                </label>
                <input
                  id="global-search"
                  name="q"
                  type="search"
                  placeholder="Search…"
                  aria-label="Search students, staff and applicants"
                  className="w-44 rounded-md border border-[color:var(--color-line)] px-3 py-1.5 text-sm outline-none transition focus:w-60 focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
              </form>
            )}
            <Link href="/portal/account" className="text-right hover:opacity-80">
              <p className="text-sm font-medium leading-tight">
                {user.displayName}
              </p>
              <p className="text-xs text-[color:var(--color-muted)]">
                {roleNames || "No role"}
              </p>
            </Link>
            <Link href="/portal/account" aria-label="Account settings" className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 hover:bg-brand-200 transition">
              {user.displayName.slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </header>

        {ctx.impersonatedByUserId && (
          <div className="flex items-center justify-center gap-3 bg-amber-500 px-6 py-2 text-center text-sm font-medium text-white">
            <span>
              You are viewing as {user.displayName} (support impersonation).
            </span>
            <form action={endImpersonationAction}>
              <button type="submit" className="underline">
                End impersonation
              </button>
            </form>
          </div>
        )}

        {showBreachWarning && <BreachWarningBanner />}

        {ctx.isSuspended && (
          <div className="bg-red-600 px-6 py-2 text-center text-sm font-medium text-white">
            This organization&apos;s subscription is suspended — most actions
            are unavailable. No data has been deleted.{" "}
            <a href="/portal/billing" className="underline">
              View subscription
            </a>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
