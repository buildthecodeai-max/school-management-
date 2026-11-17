"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { retryDelivery } from "@/lib/notify";
import { audit } from "@/lib/audit";

export async function retryDeliveryAction(formData: FormData) {
  const ctx = await requirePermission("notifications.operate");
  const deliveryId = String(formData.get("deliveryId"));

  const result = await retryDelivery(deliveryId, ctx.tenantId!);
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "notifications.retry",
    targetType: "DeliveryAttempt",
    targetId: deliveryId,
    outcome: result?.status === "SENT" ? "SUCCESS" : "FAILURE",
  });

  revalidatePath("/portal/notifications");
}
