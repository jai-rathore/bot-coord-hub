import { and, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import {
  agentProfiles,
  apiKeys,
  eventParticipants,
  events,
  users,
  type User,
} from "@/db/schema";

/**
 * Everyone you have actually coordinated with.
 *
 * People used to list only the connections you had deliberately made, which
 * left it empty for someone whose whole use of HoneyMatcha was answering an
 * event link — the six people they just picked a restaurant with were nowhere.
 * They belong on the page.
 *
 * What they must not do is arrive holding permissions. A shared event is not
 * consent to check somebody's calendar, so these entries carry no scopes and
 * no link row at all; they are a record of having met, with one button that
 * starts the ordinary invite if you want the real thing.
 */
export type MetPerson = {
  userId: string;
  name: string | null;
  email: string;
  handle: string | null;
  /** The event you were both on, most recent first. */
  viaEventId: string;
  viaEventTitle: string;
  /** True when the shared event was yours. */
  youOrganized: boolean;
  metAt: string;
  agentConnected: boolean;
};

/**
 * Which of these people run an agent of their own.
 *
 * "Connected" means a key that has actually been used — a key someone created
 * and never pointed anything at is not an agent, and showing it as one would
 * promise a peer capability that is not there.
 */
export async function agentConnectedUserIds(
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const db = getDb();
  const rows = await db
    .select({ userId: apiKeys.userId })
    .from(apiKeys)
    .where(
      and(
        inArray(apiKeys.userId, userIds),
        isNull(apiKeys.revokedAt),
        isNotNull(apiKeys.lastUsedAt),
      ),
    );
  return new Set(rows.map((row) => row.userId));
}

/**
 * People you share an event with, minus anyone already connected.
 *
 * One row per person — the most recent event you were both on — because this
 * is a list of people, not of meetings.
 */
export async function listPeopleMetThroughEvents(
  user: User,
  opts: { excludeUserIds?: Set<string>; limit?: number } = {},
): Promise<MetPerson[]> {
  const db = getDb();
  const limit = opts.limit ?? 100;
  const exclude = opts.excludeUserIds ?? new Set<string>();

  const mine = alias(eventParticipants, "mine");
  const theirs = alias(eventParticipants, "theirs");

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      eventId: events.id,
      eventTitle: events.title,
      organizerUserId: events.organizerUserId,
      joinedAt: theirs.joinedAt,
    })
    .from(mine)
    .innerJoin(
      theirs,
      and(eq(theirs.eventId, mine.eventId), ne(theirs.userId, mine.userId)),
    )
    .innerJoin(users, eq(users.id, theirs.userId))
    .innerJoin(events, eq(events.id, mine.eventId))
    .where(eq(mine.userId, user.id))
    .orderBy(desc(theirs.joinedAt))
    .limit(limit * 4);

  // Rows arrive newest first, so the first sighting of a person is the most
  // recent event you shared — every later one is older by construction.
  const seen = new Map<string, MetPerson>();
  for (const row of rows) {
    if (row.userId === user.id) continue;
    if (exclude.has(row.userId)) continue;
    if (seen.has(row.userId)) continue;
    seen.set(row.userId, {
      userId: row.userId,
      name: row.name,
      email: row.email,
      handle: null,
      viaEventId: row.eventId,
      viaEventTitle: row.eventTitle,
      youOrganized: row.organizerUserId === user.id,
      metAt: row.joinedAt.toISOString(),
      agentConnected: false,
    });
    if (seen.size >= limit) break;
  }

  const people = [...seen.values()];
  if (people.length === 0) return [];

  const ids = people.map((person) => person.userId);
  const [handles, withAgents] = await Promise.all([
    db
      .select({ userId: agentProfiles.userId, handle: agentProfiles.handle })
      .from(agentProfiles)
      .where(inArray(agentProfiles.userId, ids)),
    agentConnectedUserIds(ids),
  ]);
  const handleByUser = new Map(handles.map((row) => [row.userId, row.handle]));

  return people.map((person) => ({
    ...person,
    handle: handleByUser.get(person.userId) ?? null,
    agentConnected: withAgents.has(person.userId),
  }));
}
