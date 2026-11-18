import type { PermissionKey } from "./permissions";

// What each approval request type needs from its approver.
export const APPROVAL_PERMISSION: Record<string, PermissionKey> = {
  "fee.adjust": "fee.adjust",
  "inventory.requisition": "inventory.requisition.approve",
};
