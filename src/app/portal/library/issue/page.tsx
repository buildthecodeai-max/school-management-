import { redirect } from "next/navigation";

// Issuing now happens on the main library page; keep old links working.
export default async function IssueRedirect({ searchParams }: { searchParams: Promise<{ campusId?: string }> }) {
  const { campusId } = await searchParams;
  redirect(`/portal/library${campusId ? `?campusId=${encodeURIComponent(campusId)}` : ""}`);
}
