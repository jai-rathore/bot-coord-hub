import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Revoke an API key. authenticateAgent filters revoked_at IS NULL on every
 * request — revoke takes effect immediately (no key cache).
 */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const [updated] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, id),
        eq(apiKeys.userId, user.id),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({
      id: apiKeys.id,
      revokedAt: apiKeys.revokedAt,
      keyPrefix: apiKeys.keyPrefix,
      name: apiKeys.name,
    });

  if (!updated) {
    return Response.json(
      { error: "Key not found or already revoked" },
      { status: 404 },
    );
  }

  await writeAudit({
    actorUserId: user.id,
    action: "api_key.revoked",
    entityType: "api_key",
    entityId: updated.id,
    metadata: { name: updated.name, keyPrefix: updated.keyPrefix },
  });

  return Response.json({ key: updated });
}
