import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys, users, type ApiKey, type User } from "@/db/schema";
import { extractBearerToken, hashApiKey } from "@/lib/keys";

export type AgentAuth = {
  user: User;
  apiKey: ApiKey;
};

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
            "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}"`,
          }
        : undefined,
    },
  );
}
