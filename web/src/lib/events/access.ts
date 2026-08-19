/**
 * Shared route access helpers. Every event read and write resolves the viewer
 * here so authorization lives in one place.
 */

import { getDb } from "@/db";
import { eventParticipants, events, type Event, type User } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { AgentApiError } from "@/lib/agent-errors";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import { loadBoardSource, projectBoard } from "@/lib/events/board";
import { parseNotifyChannel } from "@/lib/phone";
import type { EventBoard } from "@/lib/events/types";

export function assertEventsEnabled(): void {
  if (!eventsFeatureEnabled()) {
    throw new AgentApiError(404, "Events are not available.");
  }
}

export async function eventBySlug(slug: string): Promise<Event> {
  assertEventsEnabled();
  const db = getDb();
  const [row] = await db
    .select()
    .from(events)
    .where(eq(events.shareSlug, slug))
    .limit(1);
  if (!row) throw new AgentApiError(404, "That event link is not valid.");
  return row;
}

export async function eventById(id: string): Promise<Event> {
  assertEventsEnabled();
  const db = getDb();
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!row) throw new AgentApiError(404, "That event does not exist.");
  return row;
}

export async function participantFor(
  event: Event,
  user: User | null,
): Promise<typeof eventParticipants.$inferSelect | null> {
  if (!user) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(eventParticipants)
    .where(
      and(
        eq(eventParticipants.eventId, event.id),
        eq(eventParticipants.userId, user.id),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Board for a viewer. `null` user is the anonymous public view. */
export async function boardFor(
  eventId: string,
  user: User | null,
): Promise<EventBoard> {
  const source = await loadBoardSource(eventId);
  if (!source) throw new AgentApiError(404, "That event does not exist.");
  const board = projectBoard(source, user?.id ?? null);
  if (!user) return board;
  return {
    ...board,
    viewer: {
      ...board.viewer,
      notifyChannel: parseNotifyChannel(user.notifyChannel),
      hasPhone: Boolean(user.phoneE164),
    },
  };
}

export function requireParticipant(
  participant: typeof eventParticipants.$inferSelect | null,
): typeof eventParticipants.$inferSelect {
  if (!participant) {
    throw new AgentApiError(403, "Join this event before responding.");
  }
  return participant;
}
