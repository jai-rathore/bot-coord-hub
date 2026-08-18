/**
 * "We just met" — turning a scan into a time on two calendars.
 *
 * The failure this exists to fix: two people hit it off at a conference, swap
 * handles, and never speak again, because the next step was always "text me and
 * we'll figure something out" and nobody ever does. A group event needs an
 * organizer who already knows who to invite; this needs neither.
 *
 * So the scan does the scheduling work up front. One tap picks a shape (coffee,
 * lunch, drinks, a call) and that produces a real event with real candidate
 * times already on it — nobody has to compose anything while standing in a bar.
 *
 * Two things are deliberately separate:
 *   - The *connection* is approval-gated, exactly like every other way to reach
 *     someone here. Scanning a code never links two agents on its own.
 *   - The *event* does not wait for that approval. Events don't require a link,
 *     and the meeting is the point.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  eventParticipants,
  events,
  type Event,
  type User,
} from "@/db/schema";
import { AgentApiError } from "@/lib/agent-errors";
import {
  getPublishedProfileByHandle,
  requestProfileConnection,
} from "@/lib/agent-profiles";
import { assertEventsEnabled } from "@/lib/events/access";
import { enqueueEventNotification } from "@/lib/events/notify";
import { createEvent, recordActivity } from "@/lib/events/service";
import { MEET_INTENTS, type MeetChoice } from "@/lib/meet-shapes";
import { meetSlots, normalizeTimezone } from "@/lib/meet-time";

export { MEET_INTENTS, isMeetChoice } from "@/lib/meet-shapes";
export type { MeetChoice, MeetIntent } from "@/lib/meet-shapes";
export { meetSlots, normalizeTimezone } from "@/lib/meet-time";

/** Answer within a week, while the meeting is still a memory. */
const DEADLINE_DAYS = 7;
/** Stops a scanned code from becoming a way to fill someone's event list. */
const MAX_OPEN_MEETS_PER_PAIR = 3;

function firstName(user: { name: string | null; email: string }): string {
  const trimmed = user.name?.trim();
  if (trimmed) return trimmed.split(/\s+/)[0]!;
  return user.email.split("@")[0]!;
}

/** Marks the participant row, and doubles as the "have we done this already" key. */
function participantSource(intent: MeetChoice): string {
  return `meet:${intent}`;
}

export type MeetResult = {
  ok: true;
  intent: MeetChoice;
  metName: string;
  handle: string;
  connection: {
    status: "requested" | "already_pending" | "already_connected";
    message: string;
  };
  event: {
    id: string;
    shareSlug: string;
    url: string;
    title: string;
    slots: number;
    reused: boolean;
  } | null;
};

/**
 * Act on a scanned code.
 *
 * `scanner` is the person who scanned; the handle belongs to the person whose
 * code it was. The event is organized by the scanner because they are the one
 * taking an action — nothing is written into the other person's account beyond
 * a participant row and an approval-gated connection request.
 */
export async function recordMeeting(opts: {
  scanner: User;
  handle: string;
  intent: MeetChoice;
  timezone?: unknown;
  origin: string;
  now?: Date;
}): Promise<MeetResult> {
  const found = await getPublishedProfileByHandle(opts.handle);
  if (!found) {
    throw new AgentApiError(404, "That page is unavailable.");
  }
  if (found.owner.id === opts.scanner.id) {
    throw new AgentApiError(400, "That is your own code.");
  }

  // The connection is approval-gated and never blocks the meeting.
  let connection: MeetResult["connection"];
  try {
    const requested = await requestProfileConnection({
      user: opts.scanner,
      handle: opts.handle,
    });
    connection = {
      status: requested.idempotent ? "already_pending" : "requested",
      message: requested.message,
    };
  } catch (error) {
    if (error instanceof AgentApiError && error.status === 409) {
      connection = {
        status: "already_connected",
        message: "You're already connected.",
      };
    } else {
      throw error;
    }
  }

  if (opts.intent === "connect") {
    return {
      ok: true,
      intent: opts.intent,
      metName: firstName(found.owner),
      handle: found.profile.handle,
      connection,
      event: null,
    };
  }

  assertEventsEnabled();
  const now = opts.now ?? new Date();
  const timezone = normalizeTimezone(opts.timezone);
  const source = participantSource(opts.intent);

  // A second tap on the same chip should land on the same event, not a duplicate.
  const existing = await findOpenMeetEvents(opts.scanner.id, found.owner.id);
  const reusable = existing.find((row) => row.source === source);
  if (reusable) {
    return {
      ok: true,
      intent: opts.intent,
      metName: firstName(found.owner),
      handle: found.profile.handle,
      connection,
      event: {
        id: reusable.event.id,
        shareSlug: reusable.event.shareSlug,
        url: `${opts.origin}/e/${reusable.event.shareSlug}`,
        title: reusable.event.title,
        slots: 0,
        reused: true,
      },
    };
  }
  if (existing.length >= MAX_OPEN_MEETS_PER_PAIR) {
    throw new AgentApiError(
      429,
      `You already have ${MAX_OPEN_MEETS_PER_PAIR} open plans with ${firstName(found.owner)}. Settle one first.`,
    );
  }

  const shape = MEET_INTENTS[opts.intent];
  const slots = meetSlots(opts.intent, timezone, now);
  const title = `${shape.noun} — ${firstName(found.owner)} & ${firstName(opts.scanner)}`;

  const event = await createEvent(opts.scanner, {
    title,
    description: `You two met in person. Pick the times that work and HoneyMatcha sorts out the rest.`,
    timezone,
    slots,
    // Pointless without both of you.
    quorumMin: 2,
    deadlineAt: new Date(now.getTime() + DEADLINE_DAYS * 86_400_000),
  });

  await addMeetParticipant(event, found.owner, source);

  await enqueueEventNotification({
    eventId: event.id,
    template: "event_invited",
    dedupeKey: `meet:${event.id}:${found.owner.id}`,
    payload: {
      title,
      invitedBy: firstName(opts.scanner),
      intent: opts.intent,
    },
    userId: found.owner.id,
  });

  return {
    ok: true,
    intent: opts.intent,
    metName: firstName(found.owner),
    handle: found.profile.handle,
    connection,
    event: {
      id: event.id,
      shareSlug: event.shareSlug,
      url: `${opts.origin}/e/${event.shareSlug}`,
      title,
      slots: slots.length,
      reused: false,
    },
  };
}

/** Open meet events this scanner organizes that the other person is on. */
async function findOpenMeetEvents(
  organizerUserId: string,
  otherUserId: string,
): Promise<Array<{ event: Event; source: string }>> {
  const db = getDb();
  const rows = await db
    .select({ event: events, source: eventParticipants.source })
    .from(events)
    .innerJoin(
      eventParticipants,
      and(
        eq(eventParticipants.eventId, events.id),
        eq(eventParticipants.userId, otherUserId),
      ),
    )
    .where(
      and(
        eq(events.organizerUserId, organizerUserId),
        eq(events.status, "open"),
        inArray(
          eventParticipants.source,
          Object.keys(MEET_INTENTS).map((intent) => `meet:${intent}`),
        ),
      ),
    );
  return rows;
}

/**
 * Put the scanned person on the event directly.
 *
 * joinEvent is self-service by design — it is how a share link works. This is
 * the one place someone is added by another person, and it is bounded: it only
 * happens for a code they published and someone physically scanned.
 */
async function addMeetParticipant(
  event: Event,
  user: User,
  source: string,
): Promise<void> {
  const db = getDb();
  const [participant] = await db
    .insert(eventParticipants)
    .values({
      eventId: event.id,
      userId: user.id,
      role: "invitee",
      source,
    })
    .onConflictDoNothing()
    .returning();
  if (!participant) return;

  await recordActivity({
    eventId: event.id,
    actorUserId: user.id,
    kind: "joined",
    summary: "Added from a code you scanned in person.",
  });
}

/** Count of open meet plans between two people, for the UI to hint with. */
export async function openMeetCount(
  organizerUserId: string,
  otherUserId: string,
): Promise<number> {
  const rows = await findOpenMeetEvents(organizerUserId, otherUserId);
  return rows.length;
}
