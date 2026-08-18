/**
 * Event writes. Every mutation is authorized against the signed-in user here,
 * never in the client, and every state change appends to event_activity.
 */

import { randomBytes } from "crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  eventActivity,
  eventDimensions,
  eventOptions,
  eventParticipants,
  eventResponses,
  events,
  type Event,
  type EventParticipant,
  type User,
} from "@/db/schema";
import { AgentApiError } from "@/lib/agent-errors";
import { writeAudit } from "@/lib/audit";
import { boundedText } from "@/lib/validation";
import { displayName, formatSlot } from "@/lib/events/copy";
import type { EventPref, EventVisibility } from "@/lib/events/types";

export const EVENT_LIMITS = {
  titleLength: 120,
  descriptionLength: 2_000,
  optionLabelLength: 120,
  optionsPerDimension: 20,
  participantsPerEvent: 200,
  openEventsPerOrganizer: 10,
  guestOptionsPerUser: 3,
  maxWindowDays: 365,
} as const;

export function generateShareSlug(): string {
  return randomBytes(9).toString("base64url");
}

export type CreateEventInput = {
  title: string;
  description?: string | null;
  timezone?: string;
  visibility?: EventVisibility;
  lockPolicy?: "on_quorum" | "at_deadline" | "manual";
  quorumMin?: number | null;
  capacityMax?: number | null;
  deadlineAt?: string | Date | null;
  allowChat?: boolean;
  allowGuestOptions?: boolean;
  /** Fixed place, when the organizer already knows where. */
  place?: string | null;
  /** Candidate time slots. Empty means an RSVP-only event. */
  slots?: Array<{ startsAt: string | Date; endsAt?: string | Date | null }>;
  /** RSVP events: the single fixed time, if any. */
  fixedStartsAt?: string | Date | null;
  fixedEndsAt?: string | Date | null;
};

function parseDate(value: unknown, field: string): Date {
  const date =
    value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) {
    throw new AgentApiError(400, `${field} must be a valid date`);
  }
  return date;
}

function normalizeVisibility(value: unknown): EventVisibility {
  if (value === "counts_only" || value === "blind" || value === "open") {
    return value;
  }
  return "open";
}

export async function createEvent(
  organizer: User,
  input: CreateEventInput,
): Promise<Event> {
  const db = getDb();

  const title = boundedText(input.title, "title", EVENT_LIMITS.titleLength, {
    required: true,
  })!;
  const description = boundedText(
    input.description,
    "description",
    EVENT_LIMITS.descriptionLength,
  );
  const place = boundedText(input.place, "place", EVENT_LIMITS.optionLabelLength);

  // A blank deadline means "48 hours from now" — the form leaves it empty.
  const deadlineAt = input.deadlineAt
    ? parseDate(input.deadlineAt, "deadlineAt")
    : new Date(Date.now() + 48 * 3600_000);
  const now = new Date();
  if (deadlineAt.getTime() <= now.getTime()) {
    throw new AgentApiError(400, "The deadline must be in the future");
  }
  const maxDeadline = new Date(
    now.getTime() + EVENT_LIMITS.maxWindowDays * 86_400_000,
  );
  if (deadlineAt.getTime() > maxDeadline.getTime()) {
    throw new AgentApiError(400, "The deadline is too far in the future");
  }

  const openCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(events)
    .where(
      and(eq(events.organizerUserId, organizer.id), eq(events.status, "open")),
    );
  if ((openCount[0]?.count ?? 0) >= EVENT_LIMITS.openEventsPerOrganizer) {
    throw new AgentApiError(
      429,
      `You already have ${EVENT_LIMITS.openEventsPerOrganizer} open events. Close one before creating another.`,
    );
  }

  const slots = (input.slots ?? []).map((slot, index) => ({
    startsAt: parseDate(slot.startsAt, `slots[${index}].startsAt`),
    endsAt: slot.endsAt ? parseDate(slot.endsAt, `slots[${index}].endsAt`) : null,
  }));
  if (slots.length > EVENT_LIMITS.optionsPerDimension) {
    throw new AgentApiError(
      400,
      `An event can offer at most ${EVENT_LIMITS.optionsPerDimension} times`,
    );
  }
  for (const slot of slots) {
    if (slot.endsAt && slot.endsAt.getTime() <= slot.startsAt.getTime()) {
      throw new AgentApiError(400, "Each slot must end after it starts");
    }
  }

  const fixedStartsAt = input.fixedStartsAt
    ? parseDate(input.fixedStartsAt, "fixedStartsAt")
    : null;
  const fixedEndsAt = input.fixedEndsAt
    ? parseDate(input.fixedEndsAt, "fixedEndsAt")
    : null;

  if (slots.length === 0 && !fixedStartsAt) {
    throw new AgentApiError(
      400,
      "Give the event a fixed time, or at least one time to choose from",
    );
  }

  const quorumMin =
    input.quorumMin == null || Number(input.quorumMin) < 1
      ? null
      : Math.floor(Number(input.quorumMin));
  const capacityMax =
    input.capacityMax == null || Number(input.capacityMax) < 1
      ? null
      : Math.floor(Number(input.capacityMax));

  const timezone = boundedText(input.timezone, "timezone", 64) ?? "UTC";

  // Slug collisions are astronomically unlikely; retry anyway rather than 500.
  let created: Event | undefined;
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    try {
      const [row] = await db
        .insert(events)
        .values({
          shareSlug: generateShareSlug(),
          organizerUserId: organizer.id,
          title,
          description: description ?? null,
          timezone,
          status: "open",
          visibility: normalizeVisibility(input.visibility),
          lockPolicy:
            input.lockPolicy === "on_quorum" || input.lockPolicy === "manual"
              ? input.lockPolicy
              : "at_deadline",
          quorumMin,
          capacityMax,
          deadlineAt,
          allowChat: input.allowChat !== false,
          allowGuestOptions: input.allowGuestOptions !== false,
          agentName: "Sage",
        })
        .returning();
      created = row;
    } catch (error) {
      const message = String((error as Error)?.message ?? "");
      if (!message.includes("events_share_slug_uidx")) throw error;
    }
  }
  if (!created) {
    throw new AgentApiError(500, "Could not create the event. Try again.");
  }
  const event = created;

  // ---- dimensions -------------------------------------------------------
  const [attendanceDim] = await db
    .insert(eventDimensions)
    .values({
      eventId: event.id,
      kind: "attendance",
      label: "Who's in",
      mode: "open",
      position: 0,
    })
    .returning();

  if (slots.length > 0) {
    const [timeDim] = await db
      .insert(eventDimensions)
      .values({
        eventId: event.id,
        kind: "time",
        label: "When",
        mode: "open",
        position: 1,
      })
      .returning();
    await db.insert(eventOptions).values(
      slots.map((slot, index) => ({
        eventId: event.id,
        dimensionId: timeDim.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        position: index,
        createdByRole: "organizer",
        createdByUserId: organizer.id,
      })),
    );
  } else if (fixedStartsAt) {
    const [timeDim] = await db
      .insert(eventDimensions)
      .values({
        eventId: event.id,
        kind: "time",
        label: "When",
        mode: "fixed",
        position: 1,
      })
      .returning();
    await db.insert(eventOptions).values({
      eventId: event.id,
      dimensionId: timeDim.id,
      startsAt: fixedStartsAt,
      endsAt: fixedEndsAt,
      position: 0,
      createdByRole: "organizer",
      createdByUserId: organizer.id,
    });
  }

  if (place) {
    const [placeDim] = await db
      .insert(eventDimensions)
      .values({
        eventId: event.id,
        kind: "place",
        label: "Where",
        mode: "fixed",
        position: 2,
      })
      .returning();
    await db.insert(eventOptions).values({
      eventId: event.id,
      dimensionId: placeDim.id,
      label: place,
      position: 0,
      createdByRole: "organizer",
      createdByUserId: organizer.id,
    });
  }

  // The organizer is always a participant.
  await db.insert(eventParticipants).values({
    eventId: event.id,
    userId: organizer.id,
    role: "organizer",
    source: "organizer",
  });

  await recordActivity({
    eventId: event.id,
    actorUserId: organizer.id,
    kind: "created",
    summary: `${displayName(organizer.name, organizer.email)} created “${title}”.`,
    body: { slots: slots.length, quorumMin, visibility: event.visibility },
  });
  await writeAudit({
    actorUserId: organizer.id,
    action: "event.create",
    entityType: "event",
    entityId: event.id,
    metadata: { title, slots: slots.length },
  });

  void attendanceDim;
  return event;
}

export async function joinEvent(
  event: Event,
  user: User,
): Promise<EventParticipant> {
  const db = getDb();

  const existing = await db
    .select()
    .from(eventParticipants)
    .where(
      and(
        eq(eventParticipants.eventId, event.id),
        eq(eventParticipants.userId, user.id),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  if (event.status !== "open") {
    throw new AgentApiError(409, "This event is no longer open.");
  }

  const count = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventParticipants)
    .where(eq(eventParticipants.eventId, event.id));
  if ((count[0]?.count ?? 0) >= EVENT_LIMITS.participantsPerEvent) {
    throw new AgentApiError(409, "This event is full.");
  }

  const [participant] = await db
    .insert(eventParticipants)
    .values({
      eventId: event.id,
      userId: user.id,
      role: "invitee",
      source: "share_link",
    })
    .onConflictDoNothing()
    .returning();

  if (!participant) {
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
    if (!row) throw new AgentApiError(500, "Could not join this event.");
    return row;
  }

  await recordActivity({
    eventId: event.id,
    actorUserId: user.id,
    kind: "joined",
    summary: `${displayName(user.name, user.email)} opened the event.`,
  });

  // The organizer's agent should know the shape of the room is changing. Agent
  // only — one email per person who opens a link would be noise. Imported
  // lazily because notify.ts reads this module.
  if (event.organizerUserId !== user.id) {
    const { enqueueEventNotification } = await import("@/lib/events/notify");
    await enqueueEventNotification({
      eventId: event.id,
      template: "participant_joined",
      dedupeKey: `joined:${event.id}:${participant.id}`,
      payload: { title: event.title },
      toOrganizerOnly: true,
      notifyHumans: false,
    });
  }

  return participant;
}

export type ResponseEntry = { optionId: string; value: EventPref };

export async function setResponses(
  event: Event,
  participant: EventParticipant,
  entries: ResponseEntry[],
  attendance?: EventPref,
): Promise<void> {
  const db = getDb();

  if (event.status !== "open") {
    throw new AgentApiError(409, "This event is closed to new responses.");
  }
  if (event.deadlineAt.getTime() <= Date.now()) {
    throw new AgentApiError(409, "The deadline for this event has passed.");
  }

  const optionIds = [...new Set(entries.map((e) => e.optionId))];
  if (optionIds.length > 0) {
    const options = await db
      .select()
      .from(eventOptions)
      .where(
        and(
          eq(eventOptions.eventId, event.id),
          inArray(eventOptions.id, optionIds),
        ),
      );
    if (options.length !== optionIds.length) {
      throw new AgentApiError(400, "One of those choices is not on this event.");
    }
    const byId = new Map(options.map((o) => [o.id, o] as const));

    for (const entry of entries) {
      if (!["yes", "no", "maybe"].includes(entry.value)) {
        throw new AgentApiError(400, "A response must be yes, no, or maybe.");
      }
      const option = byId.get(entry.optionId)!;
      await db
        .insert(eventResponses)
        .values({
          eventId: event.id,
          participantId: participant.id,
          dimensionId: option.dimensionId,
          optionId: option.id,
          value: entry.value,
        })
        .onConflictDoUpdate({
          target: [eventResponses.participantId, eventResponses.optionId],
          set: { value: entry.value, updatedAt: new Date() },
        });
    }
  }

  const nextAttendance =
    attendance ??
    (entries.some((e) => e.value === "yes")
      ? "yes"
      : entries.some((e) => e.value === "maybe")
        ? "maybe"
        : entries.length > 0
          ? "no"
          : participant.attendance);

  await db
    .update(eventParticipants)
    .set({
      attendance: nextAttendance,
      respondedAt: new Date(),
      lastSeenAt: new Date(),
    })
    .where(eq(eventParticipants.id, participant.id));

  await recordActivity({
    eventId: event.id,
    actorUserId: participant.userId,
    kind: "responded",
    summary: `A participant responded (${nextAttendance}).`,
    body: { entries: entries.length, attendance: nextAttendance },
  });

  await notifySubscribersOfUpdate(event, participant.userId, {
    kind: "responded",
    summary: `Someone answered (${nextAttendance}).`,
  });
}

/**
 * Tell people who opted in that the event moved.
 *
 * Deliberately nameless and tally-free: an email is outside the board's
 * visibility projection, so it must never say more than the most restricted
 * viewer could see. Under anything but open visibility, response updates go
 * only to the organizer (who sees everything) — and only if they opted in.
 * Imported lazily because notify.ts reads this module.
 */
async function notifySubscribersOfUpdate(
  event: Event,
  actorUserId: string,
  update: { kind: string; summary: string },
): Promise<void> {
  const { enqueueEventNotification } = await import("@/lib/events/notify");
  const base = {
    eventId: event.id,
    template: "event_update",
    payload: { title: event.title, summary: update.summary },
  };
  const responsesArePrivate =
    update.kind === "responded" && event.visibility !== "open";

  if (responsesArePrivate) {
    if (event.organizerUserId === actorUserId) return;
    const db = getDb();
    const [organizerRow] = await db
      .select({ notifyUpdates: eventParticipants.notifyUpdates })
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.eventId, event.id),
          eq(eventParticipants.userId, event.organizerUserId),
        ),
      )
      .limit(1);
    if (!organizerRow?.notifyUpdates) return;
    await enqueueEventNotification({
      ...base,
      dedupeKey: `update:${update.kind}:${event.id}:${event.organizerUserId}:${Date.now()}`,
      userId: event.organizerUserId,
    });
    return;
  }

  await enqueueEventNotification({
    ...base,
    dedupeKey: `update:${update.kind}:${event.id}:${Date.now()}`,
    toSubscribedParticipants: true,
    excludeUserId: actorUserId,
  });
}

/**
 * Flip update notifications for this person, joining them first if needed —
 * subscribing to an event is engaging with it, exactly like responding is.
 */
export async function setNotifyUpdates(
  event: Event,
  user: User,
  notify: boolean,
): Promise<EventParticipant> {
  const db = getDb();
  let participant = await db
    .select()
    .from(eventParticipants)
    .where(
      and(
        eq(eventParticipants.eventId, event.id),
        eq(eventParticipants.userId, user.id),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (!participant) participant = await joinEvent(event, user);

  const [updated] = await db
    .update(eventParticipants)
    .set({ notifyUpdates: notify })
    .where(eq(eventParticipants.id, participant.id))
    .returning();
  return updated ?? participant;
}

export async function addOption(
  event: Event,
  user: User,
  input: { dimensionId: string; startsAt?: string | Date; endsAt?: string | Date | null; label?: string },
  role: "organizer" | "participant",
): Promise<void> {
  const db = getDb();

  if (event.status !== "open") {
    throw new AgentApiError(409, "This event is closed.");
  }
  if (role === "participant" && !event.allowGuestOptions) {
    throw new AgentApiError(403, "The organizer turned off suggestions.");
  }

  const [dimension] = await db
    .select()
    .from(eventDimensions)
    .where(
      and(
        eq(eventDimensions.id, input.dimensionId),
        eq(eventDimensions.eventId, event.id),
      ),
    )
    .limit(1);
  if (!dimension) throw new AgentApiError(404, "Unknown part of this event.");
  if (dimension.mode !== "open") {
    throw new AgentApiError(409, "That part of the event is already fixed.");
  }

  const existing = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventOptions)
    .where(eq(eventOptions.dimensionId, dimension.id));
  if ((existing[0]?.count ?? 0) >= EVENT_LIMITS.optionsPerDimension) {
    throw new AgentApiError(409, "There are already too many choices here.");
  }

  if (role === "participant") {
    const mine = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventOptions)
      .where(
        and(
          eq(eventOptions.eventId, event.id),
          eq(eventOptions.createdByUserId, user.id),
          eq(eventOptions.createdByRole, "participant"),
        ),
      );
    if ((mine[0]?.count ?? 0) >= EVENT_LIMITS.guestOptionsPerUser) {
      throw new AgentApiError(
        429,
        `You can suggest at most ${EVENT_LIMITS.guestOptionsPerUser} options.`,
      );
    }
  }

  const label = boundedText(input.label, "label", EVENT_LIMITS.optionLabelLength);
  const startsAt = input.startsAt ? parseDate(input.startsAt, "startsAt") : null;
  const endsAt = input.endsAt ? parseDate(input.endsAt, "endsAt") : null;
  if (!startsAt && !label) {
    throw new AgentApiError(400, "Give the option a time or a name.");
  }
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new AgentApiError(400, "It must end after it starts.");
  }

  await db.insert(eventOptions).values({
    eventId: event.id,
    dimensionId: dimension.id,
    startsAt,
    endsAt,
    label: label ?? null,
    position: existing[0]?.count ?? 0,
    createdByRole: role,
    createdByUserId: user.id,
  });

  const optionName = label ?? formatSlot(startsAt, endsAt, event.timezone);
  await recordActivity({
    eventId: event.id,
    actorUserId: user.id,
    kind: "option_added",
    summary:
      role === "organizer"
        ? `The organizer added ${optionName}.`
        : `${displayName(user.name, user.email)} suggested ${optionName}.`,
  });

  // Options are public on the board under every visibility, so this is safe
  // to say to any subscriber.
  await notifySubscribersOfUpdate(event, user.id, {
    kind: "option_added",
    summary:
      role === "organizer"
        ? `The organizer added another option: ${optionName}.`
        : `A new option was suggested: ${optionName}.`,
  });
}

export function assertOrganizer(event: Event, user: User): void {
  if (event.organizerUserId !== user.id) {
    throw new AgentApiError(403, "Only the organizer can do that.");
  }
}

export async function extendDeadline(
  event: Event,
  user: User,
  deadlineAt: string | Date,
): Promise<void> {
  assertOrganizer(event, user);
  const db = getDb();
  const next = parseDate(deadlineAt, "deadlineAt");
  if (next.getTime() <= Date.now()) {
    throw new AgentApiError(400, "Pick a deadline in the future.");
  }
  await db
    .update(events)
    .set({
      deadlineAt: next,
      status: event.status === "expired" ? "open" : event.status,
      updatedAt: new Date(),
    })
    .where(eq(events.id, event.id));
  await recordActivity({
    eventId: event.id,
    actorUserId: user.id,
    kind: "deadline_extended",
    summary: `The organizer moved the deadline to ${next.toISOString()}.`,
  });
}

export async function lockEvent(event: Event, user: User): Promise<void> {
  assertOrganizer(event, user);
  if (event.status !== "open") {
    throw new AgentApiError(409, "This event is not open.");
  }
  const db = getDb();
  await db
    .update(events)
    .set({ status: "locked", lockedAt: new Date(), updatedAt: new Date() })
    .where(eq(events.id, event.id));
  await recordActivity({
    eventId: event.id,
    actorUserId: user.id,
    kind: "locked",
    summary: "The organizer closed responses.",
  });
  await writeAudit({
    actorUserId: user.id,
    action: "event.lock",
    entityType: "event",
    entityId: event.id,
  });
}

export async function cancelEvent(event: Event, user: User): Promise<void> {
  assertOrganizer(event, user);
  if (event.status === "cancelled") return;
  const db = getDb();
  await db
    .update(events)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(events.id, event.id));
  await recordActivity({
    eventId: event.id,
    actorUserId: user.id,
    kind: "cancelled",
    summary: "The organizer cancelled this event.",
  });
  const { enqueueEventNotification } = await import("@/lib/events/notify");
  await enqueueEventNotification({
    eventId: event.id,
    template: "event_cancelled",
    dedupeKey: `event_cancelled:${event.id}`,
    payload: { title: event.title },
    toAllParticipants: true,
  });
  await writeAudit({
    actorUserId: user.id,
    action: "event.cancel",
    entityType: "event",
    entityId: event.id,
  });
}

export async function rotateShareSlug(
  event: Event,
  user: User,
): Promise<string> {
  assertOrganizer(event, user);
  const db = getDb();
  const slug = generateShareSlug();
  await db
    .update(events)
    .set({ shareSlug: slug, updatedAt: new Date() })
    .where(eq(events.id, event.id));
  await recordActivity({
    eventId: event.id,
    actorUserId: user.id,
    kind: "link_rotated",
    summary: "The organizer replaced the share link.",
  });
  return slug;
}

export async function listEventsForUser(user: User) {
  const db = getDb();
  const organized = await db
    .select()
    .from(events)
    .where(eq(events.organizerUserId, user.id))
    .orderBy(desc(events.createdAt))
    .limit(50);

  const joinedRows = await db
    .select({ event: events })
    .from(eventParticipants)
    .innerJoin(events, eq(eventParticipants.eventId, events.id))
    .where(eq(eventParticipants.userId, user.id))
    .orderBy(desc(events.createdAt))
    .limit(50);

  const joined = joinedRows
    .map((r) => r.event)
    .filter((e) => e.organizerUserId !== user.id);

  return { organized, joined };
}

export async function recordActivity(entry: {
  eventId: string;
  actorUserId?: string | null;
  kind: string;
  summary: string;
  body?: Record<string, unknown>;
}) {
  try {
    const db = getDb();
    await db.insert(eventActivity).values({
      eventId: entry.eventId,
      actorUserId: entry.actorUserId ?? null,
      kind: entry.kind,
      summary: entry.summary,
      body: entry.body ?? {},
    });
  } catch (error) {
    console.error("[events] activity write failed", entry.kind, error);
  }
}
