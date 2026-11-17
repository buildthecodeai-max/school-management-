import "server-only";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { PermissionKey } from "./permissions";

export { API_SCOPES } from "./api-scopes";

export interface ApiKeyPair {
  keyId: string;
  secret: string;
  /** The single opaque token to hand to the integrator: `keyId.secret`. */
  token: string;
}

// Generates a new key pair. The caller must show `token` to the user exactly
// once — only `keyId` and a hash of `secret` are ever persisted.
export function generateApiKey(): ApiKeyPair {
  const keyId = "sk_" + randomBytes(8).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  return { keyId, secret, token: `${keyId}.${secret}` };
}

export async function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, 10);
}

export interface AuthenticatedClient {
  apiClientId: string;
  tenantId: string;
  scopes: PermissionKey[];
}

// Verifies an `Authorization: Bearer <keyId>.<secret>` header against the
// stored ApiClient. Returns null for anything invalid/revoked — callers
// respond 401 without leaking which part failed.
export async function verifyApiKey(
  authHeader: string | null,
): Promise<AuthenticatedClient | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const keyId = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!secret) return null;

  const client = await prisma.apiClient.findUnique({ where: { keyId } });
  if (!client || client.status !== "ACTIVE") return null;

  const ok = await bcrypt.compare(secret, client.secretHash);
  if (!ok) return null;

  // Best-effort last-used stamp; never block the request on this write.
  prisma.apiClient
    .update({ where: { id: client.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    apiClientId: client.id,
    tenantId: client.tenantId,
    scopes: client.scopes as PermissionKey[],
  };
}

export function hasScope(client: AuthenticatedClient, scope: PermissionKey): boolean {
  return client.scopes.includes(scope);
}
