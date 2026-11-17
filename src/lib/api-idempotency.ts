import "server-only";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "./db";

// Mutating endpoints that could cause financial/operational harm on a
// duplicate retry must support an Idempotency-Key (API-003): the first
// request with a given key executes and its response is cached; a repeat
// with the same client + key returns the original response verbatim. Reusing
// a key with a *different* request body is rejected, since that almost
// always indicates a client bug rather than an intentional retry.
export async function withIdempotency(
  request: Request,
  apiClientId: string,
  tenantId: string,
  body: unknown,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const key = request.headers.get("idempotency-key");
  if (!key) return handler();

  const requestHash = createHash("sha256")
    .update(request.method + request.url + JSON.stringify(body ?? {}))
    .digest("hex");

  const existing = await prisma.idempotencyKey.findUnique({
    where: { apiClientId_key: { apiClientId, key } },
  });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      return NextResponse.json(
        {
          error: {
            code: "idempotency_key_conflict",
            message: "This Idempotency-Key was already used with a different request.",
          },
        },
        { status: 409 },
      );
    }
    return NextResponse.json(existing.responseBody as object, {
      status: existing.statusCode,
      headers: { "Idempotency-Replayed": "true" },
    });
  }

  const response = await handler();
  // Only cache successful/deterministic outcomes — never cache a transient
  // server error, so a real retry after a 5xx can still succeed.
  if (response.status < 500) {
    const cloned = response.clone();
    const responseBody = await cloned.json().catch(() => ({}));
    await prisma.idempotencyKey
      .create({
        data: {
          tenantId,
          apiClientId,
          key,
          requestHash,
          statusCode: response.status,
          responseBody,
        },
      })
      // A race on the same key/tenant is fine — the first writer wins and
      // this one just skips caching; the response already went out.
      .catch(() => {});
  }
  return response;
}
