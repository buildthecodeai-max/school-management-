// UX/BRN: Campus switcher — remembers the user's chosen campus so campus-scoped
// pages default to it. The cookie is a preference only; readers re-validate it
// against live scope (see lib/campus-preference.ts), and this route refuses to
// store a campus the caller has no claim to in the first place.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/rbac";
import {
  CAMPUS_COOKIE,
  CAMPUS_COOKIE_MAX_AGE,
  canPreferCampus,
} from "@/lib/campus-preference";

// `referer` is attacker-controllable, so it is only honoured when it points
// back into this origin; anything else falls back to the portal root.
function safeRedirectTarget(req: NextRequest): string {
  const referer = req.headers.get("referer");
  if (!referer) return "/portal";
  try {
    const url = new URL(referer);
    if (url.origin !== req.nextUrl.origin) return "/portal";
    return url.pathname + url.search;
  } catch {
    return "/portal";
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireUser();
  const target = safeRedirectTarget(req);
  const res = NextResponse.redirect(new URL(target, req.nextUrl.origin), {
    status: 303,
  });

  const body = await req.formData().catch(() => null);
  const campusId = body?.get("campusId")?.toString().trim() ?? "";

  // Empty value clears the preference and returns to organization-wide view.
  if (!campusId) {
    res.cookies.delete(CAMPUS_COOKIE);
    return res;
  }

  // Store only a campus inside the caller's tenant that they actually hold
  // (or have org-wide scope for). Anything else is silently ignored.
  if (!(await canPreferCampus(ctx, campusId))) return res;

  res.cookies.set(CAMPUS_COOKIE, campusId, {
    path: "/portal",
    maxAge: CAMPUS_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
