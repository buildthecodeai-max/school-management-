import "server-only";
import { verifyApiKey, hasScope, type AuthenticatedClient } from "./api-auth";
import { checkRateLimit } from "./api-rate-limit";
import { apiError, correlationIdFor } from "./api-response";
import { audit } from "./audit";
import type { PermissionKey } from "./permissions";
import type { NextResponse } from "next/server";

export type AuthOutcome =
  | { ok: true; client: AuthenticatedClient; correlationId: string }
  | { ok: false; response: NextResponse };

// Authenticates the request, enforces the rate limit, and checks the given
// scope — the three things every /api/v1 handler needs before touching the
// database. Callers do `const a = await authenticate(...); if (!a.ok) return
// a.response;` and get a typed `client` + `correlationId` otherwise.
export async function authenticate(
  request: Request,
  requiredScope: PermissionKey,
): Promise<AuthOutcome> {
  const correlationId = correlationIdFor(request);
  const client = await verifyApiKey(request.headers.get("authorization"));

  if (!client) {
    return {
      ok: false,
      response: apiError(
        401,
        "unauthorized",
        "Missing or invalid API credentials.",
        correlationId,
      ),
    };
  }

  const rate = checkRateLimit(client.apiClientId);
  if (!rate.allowed) {
    return {
      ok: false,
      response: apiError(
        429,
        "rate_limited",
        "Rate limit exceeded. Retry after the reset time.",
        correlationId,
        { resetAt: new Date(rate.resetAt).toISOString() },
      ),
    };
  }

  if (!hasScope(client, requiredScope)) {
    await audit({
      tenantId: client.tenantId,
      action: "api.request",
      outcome: "DENIED",
      metadata: { requiredScope, apiClientId: client.apiClientId, correlationId },
    });
    return {
      ok: false,
      response: apiError(
        403,
        "insufficient_scope",
        `This credential does not have the "${requiredScope}" scope.`,
        correlationId,
      ),
    };
  }

  return { ok: true, client, correlationId };
}
