/**
 * Event notifications.
 *
 * Everything is queued into notification_outbox first and delivered by the
 * cron drain, so a retry can never double-send: `dedupeKey` is unique and the
 * insert is a no-op on conflict.
 *
 * Delivery degrades quietly. Without RESEND_API_KEY nothing is sent and rows
 * stay queued — the product still works, people just aren't emailed.
 */

import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  eventParticipants,
  events,
  notificationOutbox,
  users,
} from "@/db/schema";

const FROM = process.env.EVENT_EMAIL_FROM || "HoneyMatcha <no-reply@honeymatcha.io>";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function publicOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() ||
    process.env.APP_ORIGIN?.trim() ||
    "https://honeymatcha.io"
  );
}

export type EnqueueInput = {
  eventId: string;
  template: string;
  dedupeKey: string;
  payload?: Record<string, unknown>;
  userId?: string;
  toAllParticipants?: boolean;
  toOrganizerOnly?: boolean;
  scheduledFor?: Date;
};

/** Returns true when a new row was queued (false when deduped). */
export async function enqueueEventNotification(
  input: EnqueueInput,
): Promise<boolean> {
  const db = getDb();

  let recipients: string[] = [];
  if (input.userId) {
    recipients = [input.userId];
  } else if (input.toOrganizerOnly) {
    const [event] = await db
      .select({ organizerUserId: events.organizerUserId })
      .from(events)
      .where(eq(events.id, input.eventId))
      .limit(1);
    if (event) recipients = [event.organizerUserId];
  } else if (input.toAllParticipants) {
    const rows = await db
      .select({ userId: eventParticipants.userId })
      .from(eventParticipants)
      .where(eq(eventParticipants.eventId, input.eventId));
    recipients = rows.map((r) => r.userId);
  }

  let queued = 0;
  for (const userId of recipients) {
    const dedupeKey =
      recipients.length > 1 || !input.userId
        ? `${input.dedupeKey}:${userId}`
        : input.dedupeKey;
    const inserted = await db
      .insert(notificationOutbox)
      .values({
        userId,
        eventId: input.eventId,
        channel: "email",
        template: input.template,
        payload: input.payload ?? {},
        dedupeKey,
        scheduledFor: input.scheduledFor ?? new Date(),
      })
      .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
      .returning({ id: notificationOutbox.id });
    if (inserted[0]) queued += 1;
  }
  return queued > 0;
}

type Rendered = { subject: string; body: string };

function renderTemplate(
  template: string,
  payload: Record<string, unknown>,
  eventUrl: string,
): Rendered {
  const title = String(payload.title ?? "your event");
  switch (template) {
    case "event_locked":
      return {
        subject: `Responses closed — ${title}`,
        body: payload.winner
          ? `${payload.winner} came out on top for “${title}”. The organizer is confirming it now.\n\n${eventUrl}`
          : `Responses for “${title}” are closed.\n\n${eventUrl}`,
      };
    case "event_confirmed":
      return {
        subject: `Confirmed — ${title}`,
        body: `“${title}” is confirmed${payload.winner ? ` for ${payload.winner}` : ""}.\n\n${eventUrl}`,
      };
    case "event_cancelled":
      return {
        subject: `Cancelled — ${title}`,
        body: `“${title}” was cancelled by the organizer.\n\n${eventUrl}`,
      };
    case "quorum_missed":
      return {
        subject: `Not enough people — ${title}`,
        body: `“${title}” closed without reaching ${payload.quorumMin ?? "enough"} people. You can reopen it with a new deadline.\n\n${eventUrl}`,
      };
    case "deadline_soon":
      return {
        subject: `${payload.hours ?? 24}h left — ${title}`,
        body: `You haven't answered “${title}” yet. It closes in about ${payload.hours ?? 24} hours.\n\n${eventUrl}`,
      };
    case "organizer_digest":
      return {
        subject: `Update — ${title}`,
        body: `${payload.summary ?? "There's new activity on your event."}\n\n${eventUrl}`,
      };
    default:
      return {
        subject: `Update — ${title}`,
        body: `There's an update on “${title}”.\n\n${eventUrl}`,
      };
  }
}

async function sendEmail(to: string, rendered: Rendered): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: rendered.subject,
      text: rendered.body,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
  }
}

export type DrainResult = { sent: number; failed: number; skipped: number };

/** Deliver queued notifications. Called from the cron tick. */
export async function drainNotificationOutbox(
  limit = 100,
  now = new Date(),
): Promise<DrainResult> {
  const db = getDb();
  const result: DrainResult = { sent: 0, failed: 0, skipped: 0 };

  const pending = await db
    .select({
      row: notificationOutbox,
      email: users.email,
      shareSlug: events.shareSlug,
    })
    .from(notificationOutbox)
    .leftJoin(users, eq(notificationOutbox.userId, users.id))
    .leftJoin(events, eq(notificationOutbox.eventId, events.id))
    .where(
      and(
        isNull(notificationOutbox.sentAt),
        lte(notificationOutbox.scheduledFor, now),
      ),
    )
    .orderBy(asc(notificationOutbox.scheduledFor))
    .limit(limit);

  if (!emailConfigured()) {
    result.skipped = pending.length;
    return result;
  }

  for (const entry of pending) {
    if (!entry.email) {
      result.skipped += 1;
      continue;
    }
    if (entry.row.attempts >= 5) {
      result.skipped += 1;
      continue;
    }
    const eventUrl = entry.shareSlug
      ? `${publicOrigin()}/e/${entry.shareSlug}`
      : publicOrigin();
    try {
      await sendEmail(
        entry.email,
        renderTemplate(entry.row.template, entry.row.payload, eventUrl),
      );
      await db
        .update(notificationOutbox)
        .set({ sentAt: new Date(), attempts: entry.row.attempts + 1 })
        .where(eq(notificationOutbox.id, entry.row.id));
      result.sent += 1;
    } catch (error) {
      await db
        .update(notificationOutbox)
        .set({
          failedAt: new Date(),
          attempts: entry.row.attempts + 1,
          lastError: String((error as Error)?.message ?? error).slice(0, 500),
        })
        .where(eq(notificationOutbox.id, entry.row.id));
      result.failed += 1;
    }
  }

  return result;
}

export { renderTemplate };
