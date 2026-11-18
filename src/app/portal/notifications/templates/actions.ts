"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { isSupportedLocale } from "@/lib/locales";

export interface TemplateActionState {
  error?: string;
  message?: string;
}

export async function saveTemplate(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  const ctx = await requirePermission("notifications.operate");
  const id = formData.get("id")?.toString().trim() ?? "";
  const code = formData.get("code")?.toString().trim() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  const category = formData.get("category")?.toString() ?? "ANNOUNCEMENT";
  const dataClassification = formData.get("dataClassification")?.toString() ?? "INTERNAL";
  const locale = formData.get("locale")?.toString().trim() || "en";
  const titleTemplate = formData.get("titleTemplate")?.toString().trim() ?? "";
  const bodyTemplate = formData.get("bodyTemplate")?.toString().trim() ?? "";

  if (!code || !name || !titleTemplate || !bodyTemplate)
    return { error: "Code, name, title and body are required." };
  if (!isSupportedLocale(locale)) return { error: "Unsupported language." };
  if (!/^[a-z][a-z0-9._-]*$/.test(code))
    return { error: "Code must be lowercase letters, numbers, dots, hyphens or underscores, starting with a letter." };

  try {
    if (id) {
      const existing = await prisma.messageTemplate.findFirst({
        where: { id, tenantId: ctx.tenantId! },
      });
      if (!existing) return { error: "Template not found." };
      await prisma.messageTemplate.update({
        where: { id },
        data: { name, category: category as never, dataClassification, titleTemplate, bodyTemplate },
      });
      await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "ntf.template.updated", targetType: "MessageTemplate", targetId: id, scopeType: "ORG", metadata: { code } });
    } else {
      const created = await prisma.messageTemplate.create({
        data: { tenantId: ctx.tenantId!, code, locale, name, category: category as never, dataClassification, titleTemplate, bodyTemplate },
      });
      await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "ntf.template.created", targetType: "MessageTemplate", targetId: created.id, scopeType: "ORG", metadata: { code } });
    }
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002")
      return { error: `A "${locale}" template with code "${code}" already exists.` };
    return { error: "Failed to save template." };
  }

  revalidatePath("/portal/notifications/templates");
  return { message: id ? "Template updated." : "Template created." };
}

export async function deleteTemplate(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  const ctx = await requirePermission("notifications.operate");
  const id = formData.get("id")?.toString().trim() ?? "";
  const existing = await prisma.messageTemplate.findFirst({ where: { id, tenantId: ctx.tenantId! } });
  if (!existing) return { error: "Template not found." };
  await prisma.messageTemplate.delete({ where: { id } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "ntf.template.deleted", targetType: "MessageTemplate", targetId: id, scopeType: "ORG", metadata: { code: existing.code } });
  revalidatePath("/portal/notifications/templates");
  return { message: "Template deleted." };
}
