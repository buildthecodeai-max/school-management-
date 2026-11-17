import type { PermissionKey } from "./permissions";

// No "server-only" here deliberately — this list is rendered in client
// components (the API client creation form), unlike the rest of api-auth.ts.
export const API_SCOPES: PermissionKey[] = [
  "student.read",
  "student.write",
  "guardian.read",
  "academics.read",
  "attendance.read",
  "attendance.write",
  "admissions.read",
  "exams.read",
  "fee.read",
];
