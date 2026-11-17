"use server";

import { requireUser } from "@/lib/rbac";
import { runGlobalSearch, type SearchResult } from "@/lib/search-core";

export type { SearchResult };

// Tenant-scoped, permission-filtered, campus-scoped global search.
// All logic lives in runGlobalSearch (src/lib/search-core.ts); this wrapper
// only supplies the authenticated context.
export async function globalSearch(query: string): Promise<SearchResult[]> {
  const ctx = await requireUser();
  return runGlobalSearch(ctx, query);
}
