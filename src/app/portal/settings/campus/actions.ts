"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus, can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { isSettingKey, validateSettingValue, type SettingKey } from "@/lib/settings";

export interface SettingActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const orgSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  locked: z.union([z.literal("on"), z.literal("")]).optional(),
});

// TEN-003 / BRN-003 — write an organization-level setting (optionally locking it
// so campuses cannot override). Requires org-wide org.settings.write.
export async function saveOrgSetting(
  _prev: SettingActionState,
  formData: FormData,
): Promise<SettingActionState> {
  const ctx = await requireUser();
  if (!can(ctx, "org.settings.write")) {
    return { error: "Organization settings require an organization-wide role." };
  }
  const parsed = orgSchema.safeParse({
    key: formData.get("key"),
    value: formData.get("value"),
    locked: formData.get("locked") ?? "",
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { key, value } = parsed.data;
  const locked = parsed.data.locked === "on";
  if (!isSettingKey(key)) return { error: `Unknown setting: ${key}` };

  const err = validateSettingValue(key, value);
  if (err) return { error: err };

  const before = await prisma.orgSetting.findUnique({
    where: { tenantId_key: { tenantId: ctx.tenantId!, key } },
  });

  await prisma.orgSetting.upsert({
    where: { tenantId_key: { tenantId: ctx.tenantId!, key } },
    create: { tenantId: ctx.tenantId!, key, value: value.trim(), locked },
    update: { value: value.trim(), locked },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "org.setting.updated",
    targetType: "OrgSetting",
    targetId: key,
    metadata: {
      key,
      from: before ? { value: before.value, locked: before.locked } : null,
      to: { value: value.trim(), locked },
    },
  });

  revalidatePath("/portal/settings/campus");
  return { ok: true, message: `Organization setting “${key}” saved${locked ? " and locked" : ""}.` };
}

const campusSchema = z.object({
  campusId: z.string().min(1),
  key: z.string().min(1),
  value: z.string(),
});

export async function saveCampusSetting(
  _prev: SettingActionState,
  formData: FormData,
): Promise<SettingActionState> {
  const ctx = await requireUser();
  const parsed = campusSchema.safeParse({
    campusId: formData.get("campusId"),
    key: formData.get("key"),
    value: formData.get("value"),
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { campusId, key, value } = parsed.data;
  if (!canForCampus(ctx, "org.settings.write", campusId)) return { error: "Permission denied." };
  if (!isSettingKey(key)) return { error: `Unknown setting: ${key}` };

  // A locked org setting cannot be overridden per campus.
  const org = await prisma.orgSetting.findUnique({
    where: { tenantId_key: { tenantId: ctx.tenantId!, key } },
  });
  if (org?.locked) {
    return { error: `“${key}” is locked at the organization level and cannot be overridden here.` };
  }

  const err = validateSettingValue(key, value);
  if (err) return { error: err };

  if (value.trim() === "") {
    // Empty clears the override → campus falls back to org/default.
    await prisma.campusSetting.deleteMany({ where: { tenantId: ctx.tenantId!, campusId, key } });
    await audit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.user.id,
      action: "campus.setting.cleared",
      targetType: "CampusSetting",
      targetId: campusId,
      campusId,
      metadata: { key },
    });
    revalidatePath("/portal/settings/campus");
    return { ok: true, message: `Override for “${key}” cleared — now inherits from the organization.` };
  }

  await prisma.campusSetting.upsert({
    where: { campusId_key: { campusId, key } },
    create: { tenantId: ctx.tenantId!, campusId, key, value: value.trim() },
    update: { value: value.trim() },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "campus.setting.updated",
    targetType: "CampusSetting",
    targetId: campusId,
    campusId,
    metadata: { key, value: value.trim() },
  });

  revalidatePath("/portal/settings/campus");
  return { ok: true, message: `Campus override for “${key}” saved.` };
}

// Kept for backward compatibility with any caller expecting a flat map.
export async function getCampusSettings(
  tenantId: string,
  campusId: string,
): Promise<Record<string, string>> {
  const rows = await prisma.campusSetting.findMany({ where: { tenantId, campusId } });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = String(r.value);
  return map;
}

export type { SettingKey };
