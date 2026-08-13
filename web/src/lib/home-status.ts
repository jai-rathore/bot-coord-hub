import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  apiKeys,
  calendarConnections,
  confirms,
  links,
  sessions,
  type User,
} from "@/db/schema";

export async function getHomeStatus(user: User) {
  const db = getDb();
  const [keys, activeLinks, pendingConfirms, recentSessions, calendar] =
    await Promise.all([
      db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          lastUsedAt: apiKeys.lastUsedAt,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(
          and(eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)),
        )
        .orderBy(desc(apiKeys.createdAt)),
      db
        .select({ id: links.id })
        .from(links)
        .where(
          and(
            eq(links.fromUserId, user.id),
            eq(links.status, "active"),
          ),
        ),
      db
        .select({ id: confirms.id })
        .from(confirms)
        .where(
          and(
            eq(confirms.userId, user.id),
            eq(confirms.status, "pending"),
          ),
        ),
      db
        .select()
        .from(sessions)
        .where(eq(sessions.initiatorUserId, user.id))
        .orderBy(desc(sessions.updatedAt))
        .limit(3),
      db
        .select({ id: calendarConnections.id })
        .from(calendarConnections)
        .where(eq(calendarConnections.userId, user.id))
        .limit(1),
    ]);

  const activeKey = keys.find((key) => key.lastUsedAt) ?? keys[0] ?? null;
  return {
    agent: {
      connected: Boolean(activeKey?.lastUsedAt),
      configured: Boolean(activeKey),
      name: activeKey?.name ?? null,
      lastUsedAt: activeKey?.lastUsedAt?.toISOString() ?? null,
    },
    calendarConnected: calendar.length > 0,
    peopleCount: activeLinks.length,
    attentionCount: pendingConfirms.length,
    recentTasks: recentSessions.map((session) => ({
      id: session.id,
      intentType: session.intentType,
      status: session.status,
      updatedAt: session.updatedAt.toISOString(),
    })),
  };
}
