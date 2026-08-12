import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { generateApiKey } from "@/lib/keys";
import { DEFAULT_AGENT_SCOPES } from "@/lib/scopes";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, user.id))
    .orderBy(desc(apiKeys.createdAt));

  return Response.json({ keys });
}

export async function POST(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body ok — use default name
  }

  const name = (body.name ?? "default").trim().slice(0, 80) || "default";
  const { rawKey, keyPrefix, keyHash } = generateApiKey();
  const db = getDb();

  const [created] = await db
    .insert(apiKeys)
    .values({
      userId: user.id,
      name,
      keyPrefix,
      keyHash,
      scopes: DEFAULT_AGENT_SCOPES,
    })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      createdAt: apiKeys.createdAt,
    });

  await writeAudit({
    actorUserId: user.id,
    action: "api_key.created",
    entityType: "api_key",
    entityId: created.id,
    metadata: {
      name: created.name,
      keyPrefix: created.keyPrefix,
      scopes: created.scopes,
    },
  });

  return Response.json(
    {
      key: created,
      rawKey,
      warning: "Store this raw key now. It will not be shown again.",
    },
    { status: 201 },
  );
}
