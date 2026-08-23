/**
 * Unread event updates for the people in the plan: not the organizer's own
 * moves. Uses existing event_activity + event_participants.last_seen_at so
 * there is no extra table. Copy is nameless on purpose: list views sit
 * outside the board's visibility projection.
 */

import { cache } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  eventActivity,
  eventParticipants,
  type Event,
  type User,
} from "@/db/schema";
import { listEventsForUser } from "@/lib/events/service";

export const RECIPIENT_UPDATE_KINDS = [
  "responded",
  "option_added",
  "joined",
  "question_asked",
  "note_added",
] as const;

export type RecipientUpdateKind = (typeof RECIPIENT_UPDATE_KINDS)[number];

export type ActivitySignal = {
  kind: string;
  actorUserId: string | null;
  createdAt: Date;
};

export type EventWithUpdates = Event & {
  unreadCount: number;
  latestUpdate: string | null;
  latestUpdateAt: Date | null;
  href: string;
};

export function isRecipientUpdateKind(kind: string): kind is RecipientUpdateKind {
  return (RECIPIENT_UPDATE_KINDS as readonly string[]).includes(kind);
}

/** Never include a name: joined summaries in the activity log do. */
export function namelessUpdateCopy(kind: string): string {
  switch (kind) {
    case "responded":
      return "Someone answered";
    case "option_added":
      return "Someone suggested a time";
    case "joined":
      return "Someone opened the event";
    case "question_asked":
      return "There's a new question";
    case "note_added":
      return "Someone added a note";
    default:
      return "There's a new update";
  }
}

export function unreadBadgeLabel(count: number): string {
  if (count <= 0) return "";
  if (count === 1) return "New";
  return `${count} updates`;
}

export function unreadRecipientUpdates(
  activity: ActivitySignal[],
  viewerUserId: string,
  lastSeenAt: Date | null,
): { unreadCount: number; latestKind: string | null; latestAt: Date | null } {
  const unread = activity.filter((row) => {
    if (!isRecipientUpdateKind(row.kind)) return false;
    if (row.actorUserId && row.actorUserId === viewerUserId) return false;
    if (lastSeenAt && row.createdAt.getTime() <= lastSeenAt.getTime()) {
      return false;
    }
    return true;
  });

  unread.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latest = unread[0];
  return {
    unreadCount: unread.length,
    latestKind: latest?.kind ?? null,
    latestAt: latest?.createdAt ?? null,
  };
}

export function eventHref(event: Event, viewerUserId: string): string {
  return event.organizerUserId === viewerUserId
    ? `/app/events/${event.id}`
    : `/e/${event.shareSlug}`;
}

export function pickFeaturedEvent(
  events: EventWithUpdates[],
): EventWithUpdates | null {
  if (events.length === 0) return null;
  const withUnread = events
    .filter((event) => event.unreadCount > 0)
    .sort((a, b) => {
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
      return (b.latestUpdateAt?.getTime() ?? 0) - (a.latestUpdateAt?.getTime() ?? 0);
    });
  if (withUnread[0]) return withUnread[0];

  const open = events
    .filter((event) => event.status === "open")
    .sort((a, b) => a.deadlineAt.getTime() - b.deadlineAt.getTime());
  return open[0] ?? events[0] ?? null;
}

export function eventsForDashboard(
  events: EventWithUpdates[],
  limit = 3,
): EventWithUpdates[] {
  return [...events]
    .sort((a, b) => {
      const aHot = a.unreadCount > 0 ? 1 : 0;
      const bHot = b.unreadCount > 0 ? 1 : 0;
      if (bHot !== aHot) return bHot - aHot;
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
      const byUpdate =
        (b.latestUpdateAt?.getTime() ?? 0) - (a.latestUpdateAt?.getTime() ?? 0);
      if (byUpdate !== 0) return byUpdate;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, limit);
}

export async function markEventSeen(
  eventId: string,
  userId: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(eventParticipants)
    .set({ lastSeenAt: new Date() })
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.userId, userId),
      ),
    );
}

/**
 * Request-scoped. The /app layout and the dashboard under it both load this,
 * and previously the layout imported a cached wrapper while the events page
 * imported this module directly, so the dedup never fired where it mattered
 * most. Caching at the source removes the chance of importing the wrong one.
 */
export const listEventsWithUpdates = cache(loadEventsWithUpdates);

async function loadEventsWithUpdates(
  user: User,
  opts: { archived?: boolean; limit?: number; offset?: number } = {},
): Promise<{
  organized: EventWithUpdates[];
  joined: EventWithUpdates[];
  unreadEventCount: number;
  featured: EventWithUpdates | null;
  hasMore: boolean;
}> {
  const { organized, joined, hasMore } = await listEventsForUser(user, opts);
  const all = [...organized, ...joined];
  if (all.length === 0) {
    return {
      organized: [],
      joined: [],
      unreadEventCount: 0,
      featured: null,
      hasMore: false,
    };
  }

  const eventIds = all.map((event) => event.id);
  const db = getDb();
  const [participants, activity] = await Promise.all([
    db
      .select({
        eventId: eventParticipants.eventId,
        lastSeenAt: eventParticipants.lastSeenAt,
      })
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.userId, user.id),
          inArray(eventParticipants.eventId, eventIds),
        ),
      ),
    db
      .select({
        eventId: eventActivity.eventId,
        kind: eventActivity.kind,
        actorUserId: eventActivity.actorUserId,
        createdAt: eventActivity.createdAt,
      })
      .from(eventActivity)
      .where(
        and(
          inArray(eventActivity.eventId, eventIds),
          inArray(eventActivity.kind, [...RECIPIENT_UPDATE_KINDS]),
        ),
      ),
  ]);

  const lastSeenByEvent = new Map(
    participants.map((row) => [row.eventId, row.lastSeenAt] as const),
  );
  const activityByEvent = new Map<string, ActivitySignal[]>();
  for (const row of activity) {
    const list = activityByEvent.get(row.eventId) ?? [];
    list.push(row);
    activityByEvent.set(row.eventId, list);
  }

  const annotate = (event: Event): EventWithUpdates => {
    const { unreadCount, latestKind, latestAt } = unreadRecipientUpdates(
      activityByEvent.get(event.id) ?? [],
      user.id,
      lastSeenByEvent.get(event.id) ?? null,
    );
    return {
      ...event,
      unreadCount,
      latestUpdate:
        unreadCount > 0 && latestKind ? namelessUpdateCopy(latestKind) : null,
      latestUpdateAt: latestAt,
      href: eventHref(event, user.id),
    };
  };

  const organizedOut = organized.map(annotate);
  const joinedOut = joined.map(annotate);
  const combined = [...organizedOut, ...joinedOut];
  return {
    organized: organizedOut,
    joined: joinedOut,
    unreadEventCount: combined.filter((event) => event.unreadCount > 0).length,
    featured: pickFeaturedEvent(combined),
    hasMore,
  };
}
