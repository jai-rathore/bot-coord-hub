/**
 * Time-driven event transitions. Runs from cron; safe to run concurrently
 * because every transition is guarded by a conditional UPDATE.
 *
 * No model is involved: deadlines, quorum, and the winning option are all
 * computed deterministically by resolve.ts.
 */

import { and, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  eventDimensions,
  eventOptions,
  eventParticipants,
  eventResponses,
  events,
  sessions,
  type Event,
} from "@/db/schema";
import { resolveDimension, type ResolvableOption } from "@/lib/events/resolve";
import { recordActivity } from "@/lib/events/service";
import { enqueueEventNotification } from "@/lib/events/notify";
import { formatSlot } from "@/lib/events/copy";

export type TickResult = {
  scanned: number;
  locked: number;
  expired: number;
  remindersQueued: number;
};

/** The dimension an event actually resolves on (time first, per the plan). */
async function decidableDimension(eventId: string) {
  const db = getDb();
  const dims = await db
    .select()
    .from(eventDimensions)
    .where(eq(eventDimensions.eventId, eventId));
  return (
    dims
      .filter((d) => d.mode === "open" && d.kind !== "attendance")
      .sort((a, b) => a.position - b.position)[0] ?? null
  );
}

export async function resolveEventOutcome(event: Event) {
  const db = getDb();
  const dimension = await decidableDimension(event.id);
  if (!dimension) return null;

  const [options, responses] = await Promise.all([
    db.select().from(eventOptions).where(eq(eventOptions.dimensionId, dimension.id)),
    db
      .select()
      .from(eventResponses)
      .where(eq(eventResponses.dimensionId, dimension.id)),
  ]);

  const resolvable: ResolvableOption[] = options.map((o) => ({
    id: o.id,
    position: o.position,
    status: o.status,
    capacity: o.capacity,
    startsAt: o.startsAt,
  }));
  const votes = responses.map((r) => ({
    optionId: r.optionId,
    value: r.value as "yes" | "no" | "maybe",
  }));

  const outcome = resolveDimension(resolvable, votes, event.quorumMin);
  const winningOption = outcome.winner
    ? (options.find((o) => o.id === outcome.winner!.optionId) ?? null)
    : null;

  return { dimension, outcome, winningOption };
}


/**
 * The single fixed time on an RSVP-style event, if it has one. Used when there
 * is no option to choose between and the only open question is who is coming.
 */
async function fixedTimeOption(eventId: string) {
  const db = getDb();
  const [dimension] = await db
    .select()
    .from(eventDimensions)
    .where(
      and(
        eq(eventDimensions.eventId, eventId),
        eq(eventDimensions.kind, "time"),
        eq(eventDimensions.mode, "fixed"),
      ),
    )
    .limit(1);
  if (!dimension) return null;
  const [option] = await db
    .select()
    .from(eventOptions)
    .where(eq(eventOptions.dimensionId, dimension.id))
    .limit(1);
  return option ?? null;
}

async function attendingCount(eventId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventParticipants)
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.attendance, "yes"),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Close an event and record its outcome. Locking never books: it creates the
 * organizer's confirm, and only their approval reaches a calendar.
 */
export async function closeEvent(event: Event): Promise<"locked" | "expired"> {
  const db = getDb();
  const resolved = await resolveEventOutcome(event);

  let quorumMet: boolean;
  let winner: Awaited<ReturnType<typeof fixedTimeOption>> = null;
  let yesCount: number;

  if (resolved) {
    quorumMet = resolved.outcome.quorumMet;
    winner = resolved.winningOption;
    yesCount = resolved.outcome.winner?.yes ?? 0;
  } else {
    // Nothing to choose between: this is an RSVP event, where the only open
    // question is who is coming. Resolve on attendance and keep the event's
    // own fixed time as the outcome, so it still reaches the organizer's
    // approval instead of silently expiring.
    yesCount = await attendingCount(event.id);
    quorumMet = yesCount >= (event.quorumMin ?? 1);
    winner = await fixedTimeOption(event.id);
  }

  // A decidable event needs a winning option; an RSVP event only needs people.
  const nextStatus: "locked" | "expired" =
    quorumMet && (resolved ? Boolean(winner) : true) ? "locked" : "expired";

  // Conditional update: whoever gets there first wins, so a concurrent tick
  // cannot double-transition or double-notify.
  const [updated] = await db
    .update(events)
    .set({
      status: nextStatus,
      lockedAt: nextStatus === "locked" ? new Date() : null,
      updatedAt: new Date(),
      outcome: {
        reason: resolved?.outcome.reason ?? (quorumMet ? "resolved" : "quorum_not_met"),
        winningOptionId: winner?.id ?? null,
        winningLabel: winner
          ? (winner.label ??
            formatSlot(winner.startsAt, winner.endsAt, event.timezone))
          : null,
        yes: yesCount,
      },
    })
    .where(and(eq(events.id, event.id), eq(events.status, "open")))
    .returning();

  if (!updated) return nextStatus; // another tick already closed it

  if (resolved?.dimension && winner) {
    await db
      .update(eventDimensions)
      .set({ resolvedOptionId: winner.id })
      .where(eq(eventDimensions.id, resolved.dimension.id));
  }

  const label = winner
    ? (winner.label ?? formatSlot(winner.startsAt, winner.endsAt, event.timezone))
    : null;

  await recordActivity({
    eventId: event.id,
    kind: nextStatus === "locked" ? "locked" : "expired",
    summary:
      nextStatus === "locked"
        ? `Responses closed. ${label} won: waiting on the organizer to confirm.`
        : `Responses closed without enough people.`,
    body: { reason: resolved?.outcome.reason, winningOptionId: winner?.id },
  });

  if (nextStatus === "locked") {
    await requestEventConfirm(updated, label);
    await enqueueEventNotification({
      eventId: event.id,
      template: "event_locked",
      dedupeKey: `event_locked:${event.id}`,
      payload: { title: event.title, winner: label },
      toAllParticipants: true,
    });
  } else {
    await enqueueEventNotification({
      eventId: event.id,
      template: "quorum_missed",
      dedupeKey: `quorum_missed:${event.id}`,
      payload: { title: event.title, quorumMin: event.quorumMin },
      toOrganizerOnly: true,
    });
  }

  return nextStatus;
}

/**
 * Create the organizer's approval gate. Events reuse the platform `confirms`
 * table so the "agent proposes, human confirms" invariant holds here too.
 */
export async function requestEventConfirm(
  event: Event,
  winnerLabel: string | null,
): Promise<void> {
  const db = getDb();
  const { confirms, sessionParticipants } = await import("@/db/schema");

  let sessionId = event.sessionId;
  if (!sessionId) {
    const [session] = await db
      .insert(sessions)
      .values({
        intentType: "group_event",
        initiatorUserId: event.organizerUserId,
        status: "proposed",
        payload: { eventId: event.id, title: event.title },
      })
      .returning();
    sessionId = session.id;
    await db.insert(sessionParticipants).values({
      sessionId,
      userId: event.organizerUserId,
      email: "",
      role: "organizer",
    }).onConflictDoNothing();
    await db
      .update(events)
      .set({ sessionId })
      .where(eq(events.id, event.id));
  }

  const existing = await db
    .select()
    .from(confirms)
    .where(
      and(eq(confirms.sessionId, sessionId), eq(confirms.action, "event.confirm")),
    )
    .limit(1);
  if (existing[0]) return;

  await db.insert(confirms).values({
    sessionId,
    userId: event.organizerUserId,
    action: "event.confirm",
    note: winnerLabel
      ? `Book “${event.title}” for ${winnerLabel}?`
      : `Confirm “${event.title}”?`,
    metadata: { eventId: event.id, winnerLabel },
    status: "pending",
  });
}

/** Queue deadline reminders for people who have not answered yet. */
async function queueDeadlineReminders(now: Date): Promise<number> {
  const db = getDb();
  let queued = 0;

  for (const [hours, tag] of [
    [24, "24h"],
    [2, "2h"],
  ] as const) {
    const windowEnd = new Date(now.getTime() + hours * 3600_000);
    const due = await db
      .select()
      .from(events)
      .where(and(eq(events.status, "open"), lte(events.deadlineAt, windowEnd)))
      .limit(200);

    for (const event of due) {
      if (event.deadlineAt.getTime() <= now.getTime()) continue;
      const pending = await db
        .select({ userId: eventParticipants.userId })
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, event.id),
            eq(eventParticipants.attendance, "pending"),
          ),
        );
      for (const participant of pending) {
        const ok = await enqueueEventNotification({
          eventId: event.id,
          userId: participant.userId,
          template: "deadline_soon",
          dedupeKey: `deadline_${tag}:${event.id}:${participant.userId}`,
          payload: { title: event.title, hours },
        });
        if (ok) queued += 1;
      }
    }
  }
  return queued;
}

export async function runEventsTick(now = new Date()): Promise<TickResult> {
  const db = getDb();

  const due = await db
    .select()
    .from(events)
    .where(and(eq(events.status, "open"), lte(events.deadlineAt, now)))
    .limit(200);

  let locked = 0;
  let expired = 0;
  for (const event of due) {
    const result = await closeEvent(event);
    if (result === "locked") locked += 1;
    else expired += 1;
  }

  // Early lock: quorum reached and the organizer asked for it.
  const earlyCandidates = await db
    .select()
    .from(events)
    .where(and(eq(events.status, "open"), eq(events.lockPolicy, "on_quorum")))
    .limit(200);
  for (const event of earlyCandidates) {
    if (event.quorumMin == null) continue;
    const resolved = await resolveEventOutcome(event);
    if (
      resolved?.outcome.quorumMet &&
      (resolved.outcome.winner?.yes ?? 0) >= event.quorumMin
    ) {
      const result = await closeEvent(event);
      if (result === "locked") locked += 1;
      else expired += 1;
    }
  }

  const remindersQueued = await queueDeadlineReminders(now);

  return { scanned: due.length, locked, expired, remindersQueued };
}

/** Purge chat transcripts past retention. Activity is kept as the audit trail. */
export async function purgeOldEventMessages(olderThanDays = 90): Promise<number> {
  const db = getDb();
  const { eventMessages } = await import("@/db/schema");
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const rows = await db
    .delete(eventMessages)
    .where(lte(eventMessages.createdAt, cutoff))
    .returning({ id: eventMessages.id });
  return rows.length;
}
