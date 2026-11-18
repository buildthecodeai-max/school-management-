import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { TemplateManager } from "./TemplateManager";

export const metadata = { title: "Notification templates" };

export default async function NotificationTemplatesPage() {
  const ctx = await requirePermission("notifications.operate");

  const templates = await prisma.messageTemplate.findMany({
    where: { tenantId: ctx.tenantId! },
    orderBy: [{ category: "asc" }, { code: "asc" }, { locale: "asc" }],
  });

  return (
    <div>
      <div className="mb-4">
        <Link href="/portal/notifications" className="text-sm text-brand-700 hover:underline">
          ← Notifications
        </Link>
      </div>
      <PageHeader
        title="Notification templates"
        subtitle="Manage reusable message templates with variable substitution for automated notifications."
      />
      <TemplateManager
        templates={templates.map(t => ({
          id: t.id,
          code: t.code,
          locale: t.locale,
          name: t.name,
          category: t.category,
          dataClassification: t.dataClassification,
          titleTemplate: t.titleTemplate,
          bodyTemplate: t.bodyTemplate,
        }))}
      />
    </div>
  );
}
