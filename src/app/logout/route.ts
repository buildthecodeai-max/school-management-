import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

// Convenience logout endpoint (also usable as a plain link).
export async function GET(request: Request) {
  await destroySession();
  return NextResponse.redirect(new URL("/login", request.url));
}
