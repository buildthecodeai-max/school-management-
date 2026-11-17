"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import type { NotificationCategory, NotificationChannel } from "@prisma/client";

const CHANNELS: NotificationChannel[] = ["EMAIL", "SMS"];
const CATEGORIES: NotificationCategory[] = [
  "ATTENDANCE",
  "FINANCE",
  "ACADEMICS",
  "ADMISSIONS",
  "ANNOUNCEMENT",
];

// Save the full preference grid + quiet hours in one submit (self-service,
// no special permission needed — a user only ever edits their own settings).
export async function savePreferences(formData: FormData) {
  const ctx = await requireUser();
  const userId = ctx.user.id;
  const tenantId = ctx.tenantId;
  if (!tenantId) throw new Error("Platform staff accounts have no notification preferences.");

  const writes = [];
  for (const category of CATEGORIES) {
    for (const channel of CHANNELS) {
      const enabled = formData.get(`pref:${category}:${channel}`) === "on";
      writes.push(
        prisma.notificationPreference.upsert({
          where: { userId_category_channel: { userId, category, channel } },
          create: { tenantId, userId, category, channel, enabled },
          update: { enabled },
        }),
      );
    }
  }

  const startRaw = formData.get("quietStart");
  const endRaw = formData.get("quietEnd");
  const quietHoursStartHour =
    startRaw != null && startRaw !== "" ? Number(startRaw) : null;
  const quietHoursEndHour = endRaw != null && endRaw !== "" ? Number(endRaw) : null;

  writes.push(
    prisma.notificationSetting.upsert({
      where: { userId },
      create: { tenantId, userId, quietHoursStartHour, quietHoursEndHour },
      update: { quietHoursStartHour, quietHoursEndHour },
    }),
  );

  await Promise.all(writes);
  revalidatePath("/portal/preferences");
}
