import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys, users, type ApiKey, type User } from "@/db/schema";
import { extractBearerToken, hashApiKey } from "@/lib/keys";

export type AgentAuth = {
  user: User;
  apiKey: ApiKey;
};

function requestAudience(request: Request): string {
  const url = new URL(request.url);
  const proto =
    request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  const path = url.pathname.replace(/\/$/, "") || "/";
  return `${proto}://${host}${path}`;
}

/** Existing manual/device credentials have no audience and remain API-wide. */
export function isApiKeyAudienceAllowed(
  audience: string | null,
  request: Request,
): boolean {
  return !audience || audience === requestAudience(request);
}

export async function authenticateAgent(
  request: Request,
): Promise<AgentAuth | null> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) return null;

  const keyHash = hashApiKey(token);
  const db = getDb();

  const rows = await db
    .select({
      apiKey: apiKeys,
      user: users,
    })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(
      and(
        eq(apiKeys.keyHash, keyHash),
        isNull(apiKeys.revokedAt),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (!isApiKeyAudienceAllowed(row.apiKey.audience, request)) {
    return null;
  }

  const now = new Date();
  if (
    !row.apiKey.lastUsedAt ||
    now.getTime() - row.apiKey.lastUsedAt.getTime() > 60_000
  ) {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: now })
      .where(eq(apiKeys.id, row.apiKey.id));
  }

  return { user: row.user, apiKey: row.apiKey };
}

export function unauthorizedJson(
  message = "Unauthorized",
  resourceMetadata?: string,
) {
  return Response.json(
    { error: message },
    {
      status: 401,
      headers: resourceMetadata
        ? {
            "WWW-Authenticate": `Bearer error="invalid_token", resource_metadata="${resourceMetadata}"`,
          }
        : undefined,
    },
  );
}
