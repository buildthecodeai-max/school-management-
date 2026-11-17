import { requireUser } from "@/lib/rbac";
import { PortalShell } from "@/components/PortalShell";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireUser();
  return <PortalShell ctx={ctx}>{children}</PortalShell>;
}
