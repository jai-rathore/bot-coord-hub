/**
 * Booking an event onto a real calendar.
 *
 * The only caller is the confirm-approval path. Nothing here runs without an
 * approved `confirms` row, which is the platform's core invariant: the agent
 * proposes, the human confirms.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  eventDimensions,
  eventOptions,
  eventParticipants,
  events,
  users,
  type Event,
} from "@/db/schema";
import { getCalendarPortForUser } from "@/lib/calendar";
import { formatSlot } from "@/lib/events/copy";
import { recordActivity } from "@/lib/events/service";
import { enqueueEventNotification } from "@/lib/events/notify";
import { writeAudit } from "@/lib/audit";

export type EventBookingResult = {
  status: "booked" | "no_time" | "already_confirmed" | "unavailable";
  message: string;
  eventId?: string;
  htmlLink?: string;
  meetLink?: string;
};

async function winningTimeOption(event: Event) {
  const db = getDb();
  const outcome = (event.outcome ?? {}) as Record<string, unknown>;

  if (typeof outcome.winningOptionId === "string") {
    const [row] = await db
      .select()
      .from(eventOptions)
      .where(eq(eventOptions.id, outcome.winningOptionId))
      .limit(1);
    if (row?.startsAt) return row;
  }

  // RSVP events fix the time up front, so take the single fixed slot.
  const [fixedTime] = await db
    .select()
    .from(eventDimensions)
    .where(
      and(
        eq(eventDimensions.eventId, event.id),
        eq(eventDimensions.kind, "time"),
        eq(eventDimensions.mode, "fixed"),
      ),
    )
    .limit(1);
  if (!fixedTime) return null;
  const [row] = await db
    .select()
    .from(eventOptions)
    .where(eq(eventOptions.dimensionId, fixedTime.id))
    .limit(1);
  return row?.startsAt ? row : null;
}

async function placeLabel(eventId: string): Promise<string | null> {
  const db = getDb();
  const [placeDim] = await db
    .select()
    .from(eventDimensions)
    .where(
      and(eq(eventDimensions.eventId, eventId), eq(eventDimensions.kind, "place")),
    )
    .limit(1);
  if (!placeDim) return null;
  const [row] = await db
    .select()
    .from(eventOptions)
    .where(eq(eventOptions.dimensionId, placeDim.id))
    .limit(1);
  return row?.label ?? null;
}

/**
 * Book the confirmed event. Attendees are the participants who said yes or
 * maybe — never the whole invite list.
 */
export async function bookConfirmedEvent(
  event: Event,
): Promise<EventBookingResult> {
  const db = getDb();

  if (event.status === "confirmed") {
    return { status: "already_confirmed", message: "Already confirmed." };
  }

  const option = await winningTimeOption(event);
  if (!option?.startsAt) {
    await db
      .update(events)
      .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(events.id, event.id));
    return {
      status: "no_time",
      message: "Confirmed. There was no time to put on a calendar.",
    };
  }

  const attendees = await db
    .select({ email: users.email, attendance: eventParticipants.attendance })
    .from(eventParticipants)
    .leftJoin(users, eq(eventParticipants.userId, users.id))
    .where(eq(eventParticipants.eventId, event.id));

  const attendeeEmails = attendees
    .filter((a) => a.attendance === "yes" || a.attendance === "maybe")
    .map((a) => a.email)
    .filter((email): email is string => Boolean(email));

  const start = option.startsAt;
  const end = option.endsAt ?? new Date(start.getTime() + 60 * 60_000);
  const place = await placeLabel(event.id);

  try {
    const port = await getCalendarPortForUser(event.organizerUserId);
    const booked = await port.createEvent({
      // Stable per event so provider retries are idempotent.
      requestId: `event:${event.id}`,
      title: event.title,
      start: start.toISOString(),
      end: end.toISOString(),
      timezone: event.timezone,
      attendeeEmails,
      notes: [event.description, place ? `Where: ${place}` : null]
        .filter(Boolean)
        .join("\n\n"),
    });

    await db
      .update(events)
      .set({
        status: "confirmed",
        confirmedAt: new Date(),
        updatedAt: new Date(),
        outcome: {
          ...((event.outcome ?? {}) as Record<string, unknown>),
          calendarEventId: booked.eventId,
          htmlLink: booked.htmlLink ?? null,
          meetLink: booked.meetLink ?? null,
        },
      })
      .where(eq(events.id, event.id));

    const label = formatSlot(start, end, event.timezone);
    await recordActivity({
      eventId: event.id,
      actorUserId: event.organizerUserId,
      kind: "confirmed",
      summary: `Confirmed for ${label} and added to the calendar.`,
      body: { calendarEventId: booked.eventId, attendees: attendeeEmails.length },
    });
    await writeAudit({
      actorUserId: event.organizerUserId,
      action: "event.book",
      entityType: "event",
      entityId: event.id,
      metadata: { calendarEventId: booked.eventId, provider: booked.provider },
    });
    await enqueueEventNotification({
      eventId: event.id,
      template: "event_confirmed",
      dedupeKey: `event_confirmed:${event.id}`,
      payload: { title: event.title, winner: label },
      toAllParticipants: true,
    });

    return {
      status: "booked",
      message: `Booked for ${label}.`,
      eventId: booked.eventId,
      htmlLink: booked.htmlLink,
      meetLink: booked.meetLink,
    };
  } catch (error) {
    // A calendar failure must not strand the event in `locked` forever — the
    // decision stands, only the calendar write failed.
    await db
      .update(events)
      .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(events.id, event.id));
    await recordActivity({
      eventId: event.id,
      kind: "confirmed",
      summary: "Confirmed, but the calendar could not be updated.",
      body: { error: String((error as Error)?.message ?? error).slice(0, 300) },
    });
    return {
      status: "unavailable",
      message:
        "Confirmed. The calendar could not be updated — connect Google Calendar at /app/settings and add it manually.",
    };
  }
}

/** Called from the confirms flow when an `event.confirm` is approved. */
export async function bookEventForConfirm(
  metadata: Record<string, unknown>,
): Promise<EventBookingResult | null> {
  const eventId = metadata?.eventId;
  if (typeof eventId !== "string") return null;
  const db = getDb();
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) return null;
  return bookConfirmedEvent(event);
}
