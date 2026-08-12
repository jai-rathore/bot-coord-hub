import { and, eq, isNull } from "drizzle-orm";
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
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.apiKey.id));

  return { user: row.user, apiKey: row.apiKey };
}

export function unauthorizedJson(message = "Unauthorized") {
  return Response.json({ error: message }, { status: 401 });
}
