import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";

/**
 * Append-only audit log. Failures are logged but do not throw — callers must
 * not block user-facing flows on audit write errors.
 */
export async function writeAudit(entry: {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const db = getDb();
    const [row] = await db
      .insert(auditLogs)
      .values({
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata ?? {},
      })
      .returning();
    return row;
  } catch (err) {
    console.error("[audit] write failed", entry.action, err);
    return null;
  }
}
