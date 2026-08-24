/**
 * Event notifications.
 *
 * Everything is queued into notification_outbox first and delivered by the
 * long-lived worker, with cron retained as a safety trigger. `dedupeKey` makes
 * enqueue replay-safe, while a delivery lease prevents concurrent drainers
 * from sending the same row at the same time.
 *
 * Delivery degrades quietly per channel. Without RESEND_API_KEY email rows
 * stay queued. Without Twilio, text rows stay queued. The product still works.
 */

import { randomUUID } from "node:crypto";
import { appOrigin } from "@/lib/connect-copy";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { and, asc, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  eventParticipants,
  events,
  notificationOutbox,
  users,
} from "@/db/schema";
import { deliverEventInbox } from "@/lib/agent-inbox";
import {
  humanChannelsFor,
  normalizePhoneE164,
  parseNotifyChannel,
  type NotifyChannel,
} from "@/lib/phone";
import { smsOffered } from "@/lib/sms-flag";

const FROM =
  process.env.EVENT_EMAIL_FROM || "HoneyMatcha <onboarding@resend.dev>";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function smsConfigured(): boolean {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  return Boolean(smsOffered() && sid && token);
}

export function publicOrigin(): string {
  return appOrigin();
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
  /** Send to participants who opted into updates (notify_updates). */
  toSubscribedParticipants?: boolean;
  /** Skip this user: the person who caused the update already knows. */
  excludeUserId?: string;
  /** Set false for mail that would be noise in an agent's inbox. */
  notifyAgents?: boolean;
  /** Set false for signals only an agent should act on, never an inbox full of mail. */
  notifyHumans?: boolean;
};

/**
 * Blind and counts-only events hide the winning slot from everyone but the
 * organizer. Email, SMS, and agent inbox used to carry `winner` to every
 * participant and skip that projection.
 */
export function payloadForRecipient(
  payload: Record<string, unknown>,
  opts: {
    visibility: string | null | undefined;
    recipientUserId: string;
    organizerUserId: string;
  },
): Record<string, unknown> {
  if (opts.visibility === "open") return payload;
  if (
    opts.recipientUserId &&
    opts.organizerUserId &&
    opts.recipientUserId === opts.organizerUserId
  ) {
    return payload;
  }
  if (!("winner" in payload)) return payload;
  const rest = { ...payload };
  delete rest.winner;
  return rest;
}

/**
 * One-line summary for the agent copy of a notification.
 *
 * Deliberately terser than the email: an agent relays or acts on this, it does
 * not read it as prose. Never includes another participant's name: the board
 * projection decides what a viewer may see, and this bypasses it.
 */
function agentSummary(
  template: string,
  payload: Record<string, unknown>,
): string {
  const title = String(payload.title ?? "an event");
  switch (template) {
    case "event_invited":
      return `You were invited to "${title}". Call get_event_board, then respond_to_event with what works for your human.`;
    case "event_update":
      return `Update on "${title}": ${payload.summary ?? "new activity"}. Call get_event_board for the current state.`;
    case "participant_joined":
      return `Someone new opened your event "${title}" and has not answered yet. Call get_event_board for the tallies.`;
    case "event_locked":
      return `Responses closed on "${title}"${payload.winner ? `: ${payload.winner} led` : ""}. The organizer confirms next.`;
    case "event_confirmed":
      return `"${title}" is confirmed${payload.winner ? ` for ${payload.winner}` : ""}. Put it on your human's radar.`;
    case "event_cancelled":
      return `"${title}" was cancelled by the organizer.`;
    case "quorum_missed":
      return `"${title}" closed without reaching quorum.`;
    case "deadline_soon":
      return `"${title}" closes in about ${payload.hours ?? 24} hours and your human has not answered. Call get_event_board and respond_to_event.`;
    case "organizer_digest":
      return `Update on your event "${title}": ${payload.summary ?? "there is new activity"}.`;
    default:
      return `There is an update on "${title}". Call get_event_board.`;
  }
}

/**
 * Queue a notification for people, and deliver the same news to their agents.
 *
 * Both channels share `dedupeKey`, so a retried tick delivers neither twice.
 * Agent delivery is best-effort: a failure there must never cost the email.
 *
 * Returns true when a new human-channel row was queued (false when deduped).
 */
export async function enqueueEventNotification(
  input: EnqueueInput,
): Promise<boolean> {
  const db = getDb();

  // One lookup serves both the organizer recipient and the agent-side link.
  const [event] = await db
    .select({
      organizerUserId: events.organizerUserId,
      shareSlug: events.shareSlug,
      visibility: events.visibility,
    })
    .from(events)
    .where(eq(events.id, input.eventId))
    .limit(1);

  let recipients: string[] = [];
  if (input.userId) {
    recipients = [input.userId];
  } else if (input.toOrganizerOnly) {
    if (event) recipients = [event.organizerUserId];
  } else if (input.toAllParticipants) {
    const rows = await db
      .select({ userId: eventParticipants.userId })
      .from(eventParticipants)
      .where(eq(eventParticipants.eventId, input.eventId));
    recipients = rows.map((r) => r.userId);
  } else if (input.toSubscribedParticipants) {
    const rows = await db
      .select({ userId: eventParticipants.userId })
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.eventId, input.eventId),
          eq(eventParticipants.notifyUpdates, true),
        ),
      );
    recipients = rows.map((r) => r.userId);
  }
  if (input.excludeUserId) {
    recipients = recipients.filter((id) => id !== input.excludeUserId);
  }

  const prefs = new Map<
    string,
    { channel: NotifyChannel; phoneE164: string | null }
  >();
  if (recipients.length > 0 && input.notifyHumans !== false) {
    const rows = await db
      .select({
        id: users.id,
        notifyChannel: users.notifyChannel,
        phoneE164: users.phoneE164,
      })
      .from(users)
      .where(inArray(users.id, recipients));
    for (const row of rows) {
      prefs.set(row.id, {
        channel: parseNotifyChannel(row.notifyChannel),
        phoneE164: row.phoneE164,
      });
    }
  }

  const dedupeKeyFor = (userId: string) =>
    recipients.length > 1 || !input.userId
      ? `${input.dedupeKey}:${userId}`
      : input.dedupeKey;

  const payloadFor = (userId: string) =>
    payloadForRecipient(input.payload ?? {}, {
      visibility: event?.visibility,
      recipientUserId: userId,
      organizerUserId: event?.organizerUserId ?? "",
    });

  // One multi-row insert rather than one per recipient per channel. Dedupe keys
  // are unique per recipient and channel, so ON CONFLICT DO NOTHING still only
  // skips rows that already existed, and the returned rows are still exactly
  // the ones actually queued.
  let queued = 0;
  if (input.notifyHumans !== false) {
    const scheduledFor = input.scheduledFor ?? new Date();
    const outboxRows = recipients.flatMap((userId) => {
      const dedupeKey = dedupeKeyFor(userId);
      const pref = prefs.get(userId) ?? {
        channel: "email" as const,
        phoneE164: null,
      };
      return humanChannelsFor({ ...pref, smsOffered: smsOffered() }).map(
        (channel) => ({
          userId,
          eventId: input.eventId,
          channel,
          template: input.template,
          payload: payloadFor(userId),
          dedupeKey: channel === "email" ? dedupeKey : `${dedupeKey}:sms`,
          scheduledFor,
        }),
      );
    });

    if (outboxRows.length > 0) {
      const inserted = await db
        .insert(notificationOutbox)
        .values(outboxRows)
        .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
        .returning({ id: notificationOutbox.id });
      queued = inserted.length;
    }
  }

  // Agent copies fan out concurrently. Each one is several queries plus an
  // outbound webhook with a 4s timeout, so serially this was up to 4s per
  // recipient before the caller's request could return.
  if (input.notifyAgents !== false) {
    await Promise.all(
      recipients.map(async (userId) => {
        try {
          await deliverEventInbox({
            userId,
            eventId: input.eventId,
            kind: `event.${input.template}`,
            summary: agentSummary(input.template, payloadFor(userId)),
            body: {
              ...payloadFor(userId),
              eventId: input.eventId,
              template: input.template,
              eventUrl: event
                ? `${publicOrigin()}/e/${event.shareSlug}`
                : undefined,
            },
            dedupeKey: `agent:${dedupeKeyFor(userId)}`,
          });
        } catch (error) {
          // Human delivery is the contract; the agent copy is additive.
          console.error("[events] agent inbox delivery failed", error);
        }
      }),
    );
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
    case "sage_operations_alert": {
      const operationsUrl = `${eventUrl.replace(/\/$/, "")}/app/admin/sage`;
      return {
        subject: `Sage operations needs attention: ${String(payload.alert ?? "queue health")}`,
        body: `${String(payload.message ?? "Sage operations crossed a configured safety threshold.")}\n\nReview the queue and recovery controls:\n${operationsUrl}`,
      };
    }
    case "discovery_recommendations": {
      const count = Number(payload.count ?? 1);
      const discoveryUrl = `${eventUrl.replace(/\/$/, "")}/app/discovery`;
      return {
        subject: `Sage found ${count} anonymous ${count === 1 ? "possibility" : "possibilities"}`,
        body: `Sage found ${count} new privacy-safe ${count === 1 ? "possibility" : "possibilities"}. Review the anonymous cards and decide whether to prepare an introduction.\n\n${discoveryUrl}`,
      };
    }
    case "event_locked":
      return {
        subject: `Responses closed: ${title}`,
        body: payload.winner
          ? `${payload.winner} came out on top for “${title}”. The organizer is confirming it now.\n\n${eventUrl}`
          : `Responses for “${title}” are closed.\n\n${eventUrl}`,
      };
    case "event_confirmed":
      return {
        subject: `Confirmed: ${title}`,
        body: `“${title}” is confirmed${payload.winner ? ` for ${payload.winner}` : ""}.\n\n${eventUrl}`,
      };
    case "event_cancelled":
      return {
        subject: `Cancelled: ${title}`,
        body: `“${title}” was cancelled by the organizer.\n\n${eventUrl}`,
      };
    case "event_invited":
      return {
        subject: `You're invited: ${title}`,
        body: `${payload.invitedBy ? `${payload.invitedBy} wants` : "Someone wants"} to find a time with you for “${title}”. Pick what works and HoneyMatcha handles the rest.\n\n${eventUrl}`,
      };
    case "quorum_missed":
      return {
        subject: `Not enough people: ${title}`,
        body: `“${title}” closed without reaching ${payload.quorumMin ?? "enough"} people. You can reopen it with a new deadline.\n\n${eventUrl}`,
      };
    case "deadline_soon":
      return {
        subject: `${payload.hours ?? 24}h left: ${title}`,
        body: `You haven't answered “${title}” yet. It closes in about ${payload.hours ?? 24} hours.\n\n${eventUrl}`,
      };
    case "event_update":
      return {
        subject: `Update: ${title}`,
        body: `${payload.summary ?? "There's new activity on this event."}\n\nYou asked to be notified when something changes here. Turn it off on the event page.\n\n${eventUrl}`,
      };
    case "organizer_digest":
      return {
        subject: `Update: ${title}`,
        body: `${payload.summary ?? "There's new activity on your event."}\n\n${eventUrl}`,
      };
    default:
      return {
        subject: `Update: ${title}`,
        body: `There's an update on “${title}”.\n\n${eventUrl}`,
      };
  }
}

function shortTitle(title: string): string {
  return title.length > 40 ? `${title.slice(0, 37)}…` : title;
}

function renderSms(
  template: string,
  payload: Record<string, unknown>,
  eventUrl: string,
): string {
  const title = shortTitle(String(payload.title ?? "your event"));
  switch (template) {
    case "sage_operations_alert": {
      const operationsUrl = `${eventUrl.replace(/\/$/, "")}/app/admin/sage`;
      return `HoneyMatcha operations: ${String(payload.message ?? "Sage needs attention")}. ${operationsUrl}`;
    }
    case "discovery_recommendations": {
      const count = Number(payload.count ?? 1);
      const discoveryUrl = `${eventUrl.replace(/\/$/, "")}/app/discovery`;
      return `HoneyMatcha: Sage found ${count} new anonymous ${count === 1 ? "possibility" : "possibilities"}. Review: ${discoveryUrl}`;
    }
    case "event_locked":
      return payload.winner
        ? `HoneyMatcha: ${payload.winner} led for “${title}”. The organizer is confirming it. ${eventUrl}`
        : `HoneyMatcha: responses for “${title}” are closed. ${eventUrl}`;
    case "event_confirmed":
      return `HoneyMatcha: “${title}” is confirmed${payload.winner ? ` for ${payload.winner}` : ""}. ${eventUrl}`;
    case "event_cancelled":
      return `HoneyMatcha: “${title}” was cancelled. ${eventUrl}`;
    case "event_invited":
      return `HoneyMatcha: you're invited to “${title}”. Pick what works: ${eventUrl}`;
    case "quorum_missed":
      return `HoneyMatcha: “${title}” closed without enough people. ${eventUrl}`;
    case "deadline_soon":
      return `HoneyMatcha: “${title}” still needs your answer. ${eventUrl}`;
    case "event_update":
      return `HoneyMatcha: ${payload.summary ?? "there's a new update"}: “${title}”. ${eventUrl}`;
    case "organizer_digest":
      return `HoneyMatcha: ${payload.summary ?? "there's a new update"} on “${title}”. ${eventUrl}`;
    default:
      return `HoneyMatcha: update on “${title}”. ${eventUrl}`;
  }
}

async function sendEmail(to: string, rendered: Rendered): Promise<string | undefined> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetchWithTimeout("https://api.resend.com/emails", {
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
  const detail = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
  }
  try {
    const parsed = JSON.parse(detail) as { id?: string };
    return parsed.id;
  } catch {
    return undefined;
  }
}

async function sendSms(to: string, body: string): Promise<string | undefined> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();
  const messagingService = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (!sid || !token || (!fromNumber && !messagingService)) {
    throw new Error("Twilio is not configured");
  }

  const params = new URLSearchParams({ To: to, Body: body });
  if (messagingService) params.set("MessagingServiceSid", messagingService);
  else if (fromNumber) params.set("From", fromNumber);

  const res = await fetchWithTimeout(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );
  const detail = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Twilio ${res.status}: ${detail.slice(0, 200)}`);
  }
  try {
    const parsed = JSON.parse(detail) as { sid?: string };
    return parsed.sid;
  } catch {
    return undefined;
  }
}

/** One-off send used by `npm run email:test` to prove Resend is wired. */
export async function sendTestEmail(to: string): Promise<string | undefined> {
  return sendEmail(to, {
    subject: "HoneyMatcha email test",
    body: "This is a test from HoneyMatcha. Event notifications will use this same Resend path.",
  });
}

/** One-off send used by `npm run sms:test` to prove Twilio is wired. */
export async function sendTestSms(to: string): Promise<string | undefined> {
  const normalized = normalizePhoneE164(to);
  if (!normalized) {
    throw new Error("That doesn't look like a mobile number.");
  }
  return sendSms(
    normalized,
    "HoneyMatcha text test. Event notifications will use this same Twilio path.",
  );
}

export type DrainResult = {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
};

export type NotificationOutboxClaim = {
  workerId: string;
  ids: string[];
};

/**
 * Claim a bounded batch before doing network I/O. The row lock protects the
 * claim itself and the durable lease protects it after the transaction ends.
 */
export async function claimNotificationOutbox(input: {
  limit?: number;
  now?: Date;
  leaseMs?: number;
  workerId?: string;
  /** Constrain maintenance verification without touching unrelated rows. */
  onlyIds?: string[];
} = {}): Promise<NotificationOutboxClaim> {
  const db = getDb();
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
  const leaseMs = Math.max(30_000, Math.min(15 * 60_000, input.leaseMs ?? 120_000));
  const workerId = input.workerId ?? `outbox:${process.pid}:${randomUUID()}`;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(
        and(
          input.onlyIds?.length
            ? inArray(notificationOutbox.id, input.onlyIds)
            : undefined,
          isNull(notificationOutbox.sentAt),
          lt(notificationOutbox.attempts, 5),
          lte(notificationOutbox.scheduledFor, now),
          or(
            isNull(notificationOutbox.leaseExpiresAt),
            lte(notificationOutbox.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(asc(notificationOutbox.scheduledFor))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (rows.length === 0) return { workerId, ids: [] };
    const ids = rows.map((row) => row.id);
    await tx
      .update(notificationOutbox)
      .set({ leasedBy: workerId, leaseExpiresAt })
      .where(inArray(notificationOutbox.id, ids));
    return { workerId, ids };
  });
}

/** Deliver one leased batch. Safe for worker and cron drainers to call together. */
export async function drainNotificationOutbox(
  limit = 100,
  now = new Date(),
  workerId?: string,
): Promise<DrainResult> {
  const db = getDb();
  const claim = await claimNotificationOutbox({ limit, now, workerId });
  const result: DrainResult = {
    claimed: claim.ids.length,
    sent: 0,
    failed: 0,
    skipped: 0,
  };
  if (claim.ids.length === 0) return result;

  const pending = await db
    .select({
      row: notificationOutbox,
      email: users.email,
      phoneE164: users.phoneE164,
      shareSlug: events.shareSlug,
    })
    .from(notificationOutbox)
    .leftJoin(users, eq(notificationOutbox.userId, users.id))
    .leftJoin(events, eq(notificationOutbox.eventId, events.id))
    .where(
      and(
        inArray(notificationOutbox.id, claim.ids),
        eq(notificationOutbox.leasedBy, claim.workerId),
        isNull(notificationOutbox.sentAt),
      ),
    )
    .orderBy(asc(notificationOutbox.scheduledFor))
    .limit(claim.ids.length);

  for (const entry of pending) {
    const channel = entry.row.channel === "sms" ? "sms" : "email";
    if (channel === "email" && !emailConfigured()) {
      result.skipped += 1;
      continue;
    }
    if (channel === "sms" && !smsConfigured()) {
      result.skipped += 1;
      continue;
    }
    if (channel === "email" && !entry.email) {
      result.skipped += 1;
      continue;
    }
    if (channel === "sms" && !entry.phoneE164) {
      result.skipped += 1;
      continue;
    }
    const eventUrl = entry.shareSlug
      ? `${publicOrigin()}/e/${entry.shareSlug}`
      : publicOrigin();
    try {
      if (channel === "sms") {
        await sendSms(
          entry.phoneE164 as string,
          renderSms(entry.row.template, entry.row.payload, eventUrl),
        );
      } else {
        await sendEmail(
          entry.email as string,
          renderTemplate(entry.row.template, entry.row.payload, eventUrl),
        );
      }
      await db
        .update(notificationOutbox)
        .set({
          sentAt: new Date(),
          attempts: entry.row.attempts + 1,
          failedAt: null,
          lastError: null,
          leasedBy: null,
          leaseExpiresAt: null,
        })
        .where(
          and(
            eq(notificationOutbox.id, entry.row.id),
            eq(notificationOutbox.leasedBy, claim.workerId),
          ),
        );
      result.sent += 1;
    } catch (error) {
      await db
        .update(notificationOutbox)
        .set({
          failedAt: new Date(),
          attempts: entry.row.attempts + 1,
          lastError: String((error as Error)?.message ?? error).slice(0, 500),
          scheduledFor: new Date(
            now.getTime() + Math.min(60 * 60_000, 30_000 * 2 ** entry.row.attempts),
          ),
          leasedBy: null,
          leaseExpiresAt: null,
        })
        .where(
          and(
            eq(notificationOutbox.id, entry.row.id),
            eq(notificationOutbox.leasedBy, claim.workerId),
          ),
        );
      result.failed += 1;
    }
  }

  const processedIds = new Set(pending.map((entry) => entry.row.id));
  const skippedIds = claim.ids.filter((id) => !processedIds.has(id));
  const undeliverableIds = pending
    .filter((entry) => {
      const channel = entry.row.channel === "sms" ? "sms" : "email";
      return (
        (channel === "email" && (!emailConfigured() || !entry.email)) ||
        (channel === "sms" && (!smsConfigured() || !entry.phoneE164))
      );
    })
    .map((entry) => entry.row.id);
  const releaseIds = [...skippedIds, ...undeliverableIds];
  if (releaseIds.length > 0) {
    await db
      .update(notificationOutbox)
      .set({ leasedBy: null, leaseExpiresAt: null })
      .where(
        and(
          inArray(notificationOutbox.id, releaseIds),
          eq(notificationOutbox.leasedBy, claim.workerId),
        ),
      );
  }

  return result;
}

export { renderTemplate, renderSms };
