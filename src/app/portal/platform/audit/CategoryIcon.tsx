import {
  Building2,
  Briefcase,
  UserCog,
  ShieldCheck,
  CreditCard,
  KeyRound,
  LogIn,
  SlidersHorizontal,
  Activity,
} from "lucide-react";
import type { AuditCategory } from "@/lib/audit-format";

const STYLE: Record<AuditCategory, { icon: typeof Activity; bg: string; fg: string }> = {
  campus: { icon: Building2, bg: "bg-brand-50", fg: "text-brand-600" },
  tenant: { icon: Briefcase, bg: "bg-violet-50", fg: "text-violet-600" },
  user: { icon: UserCog, bg: "bg-sky-50", fg: "text-sky-600" },
  role: { icon: ShieldCheck, bg: "bg-teal-50", fg: "text-teal-600" },
  billing: { icon: CreditCard, bg: "bg-green-50", fg: "text-green-600" },
  security: { icon: KeyRound, bg: "bg-amber-50", fg: "text-amber-600" },
  auth: { icon: LogIn, bg: "bg-slate-100", fg: "text-slate-500" },
  settings: { icon: SlidersHorizontal, bg: "bg-indigo-50", fg: "text-indigo-600" },
  other: { icon: Activity, bg: "bg-slate-100", fg: "text-slate-500" },
};

export function CategoryIcon({ category }: { category: AuditCategory }) {
  const { icon: Icon, bg, fg } = STYLE[category];
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${bg} ${fg}`}>
      <Icon size={16} />
    </div>
  );
}
