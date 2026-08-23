/**
 * Production-shaped schedule_meeting flow:
 * linked peers → free/busy propose → confirm gate → CalendarPort book (+ Meet).
 */

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  confirms,
  links,
  sessionMessages,
  sessionParticipants,
  sessions,
  users,
  type AllowedHours,
  type Link,
  type SessionSlot,
  type User,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { AgentApiError } from "@/lib/agent-errors";
import { completeWaitingSageScheduleJobs } from "@/lib/sage/job-store";
import {
  calendarConnectionStatus,
  collectFreeBusyForUsers,
  getCalendarPortForUser,
} from "@/lib/calendar";
import { PRODUCTION_ORIGIN } from "@/lib/connect-copy";
import { proposeFreeSlots } from "@/lib/freebusy";
import { createGuestTask } from "@/lib/guest-tasks";
import { createInviteLink } from "@/lib/links";
import {
  mergeLinkPolicies,
  shouldAutoBook,
  slotWithinAllAllowedHours,
} from "@/lib/policy";
import { requireSupportedIntent } from "@/lib/intent-gate";
import {
  buildScheduleWaitingResult,
  type WaitingPeer,
} from "@/lib/schedule-copy";
import { assertLinkScopes } from "@/lib/scopes";
import { findReusableOpenSession } from "@/lib/sessions";
import { notifyPeerAgents, type AgentNotifyResult } from "@/lib/agent-inbox";
import {
  assertPeerCount,
  boundedText,
  parseScheduleWindow,
} from "@/lib/validation";

const SCHEDULE_SCOPES = [
  "schedule_meeting",
  "avail.read_freebusy",
] as const;

type ResolvedPeer = {
  peer: User;
  actorLink: Link;
  peerLink: Link;
};

type ScheduleActor = {
  apiKeyId?: string | null;
  kind?: "user" | "agent" | "hosted_agent";
};

function findDirectionalLink(
  fromUserId: string,
  toUserId: string,
  rows: Link[],
): Link | undefined {
  return rows.find(
    (link) =>
      link.status === "active" &&
      link.fromUserId === fromUserId &&
      link.toUserId === toUserId,
  );
}

async function loadUsersByEmails(emails: string[]): Promise<User[]> {
  const normalized = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
  if (normalized.length === 0) return [];
  const db = getDb();
  return db.select().from(users).where(inArray(users.email, normalized));
}

async function participantsFor(sessionId: string) {
  const db = getDb();
  return db
    .select()
    .from(sessionParticipants)
    .where(eq(sessionParticipants.sessionId, sessionId));
}

function notifyBoardText(notified: AgentNotifyResult[]): string {
  return notified
    .map((row) => {
      const who = row.name || row.email;
      if (row.reach === "delivered_to_agent") {
        return `Reached ${who}'s agent inbox. Waiting for their agent.`;
      }
      if (row.reach === "no_paired_agent") {
        return `${who} has a HoneyMatcha account but no paired agent yet. Left this in their agent inbox.`;
      }
      return `${who} is not on HoneyMatcha yet, so there is no agent to reach.`;
    })
    .join(" ");
}

async function notifyAndRecord(opts: {
  actor: User;
  actorMeta: ScheduleActor;
  sessionId: string;
  title: string;
  recipients: Array<{
    userId: string | null;
    email: string;
    name: string | null;
  }>;
  kind?: string;
}): Promise<AgentNotifyResult[]> {
  try {
    return await notifyAndRecordInner(opts);
  } catch {
    return opts.recipients.map((recipient) => ({
      userId: recipient.userId,
      email: recipient.email,
      name: recipient.name,
      hasPairedAgent: false,
      inboxId: null,
      callback: "none" as const,
      reach: recipient.userId ? "no_paired_agent" as const : "not_on_honeymatcha" as const,
    }));
  }
}

async function notifyAndRecordInner(opts: {
  actor: User;
  actorMeta: ScheduleActor;
  sessionId: string;
  title: string;
  recipients: Array<{
    userId: string | null;
    email: string;
    name: string | null;
  }>;
  kind?: string;
}): Promise<AgentNotifyResult[]> {
  const notified = await notifyPeerAgents({
    recipients: opts.recipients,
    sessionId: opts.sessionId,
    kind: opts.kind ?? "schedule.requested",
    summary: `${opts.actor.name || opts.actor.email} wants to meet: ${opts.title}. Open this HoneyMatcha task and respond. Do not book Google yourself.`,
    body: {
      fromEmail: opts.actor.email,
      fromName: opts.actor.name,
      title: opts.title,
    },
  });

  const db = getDb();
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, opts.sessionId))
    .limit(1);
  const payload = (session?.payload ?? {}) as Record<string, unknown>;
  const waitingFor = Array.isArray(payload.waitingFor)
    ? (payload.waitingFor as Array<Record<string, unknown>>)
    : [];
  const mergedWaiting = waitingFor.map((row) => {
    const email = String(row.email ?? "").toLowerCase();
    const hit = notified.find((item) => item.email.toLowerCase() === email);
    return hit
      ? {
          ...row,
          reach: hit.reach,
          hasPairedAgent: hit.hasPairedAgent,
          inboxId: hit.inboxId,
        }
      : row;
  });
  await db
    .update(sessions)
    .set({
      payload: {
        ...payload,
        waitingFor: mergedWaiting.length ? mergedWaiting : payload.waitingFor,
        agentNotify: notified,
      },
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, opts.sessionId));

  await db.insert(sessionMessages).values({
    sessionId: opts.sessionId,
    senderUserId: opts.actor.id,
    actorApiKeyId: opts.actorMeta.apiKeyId ?? null,
    actorKind: opts.actorMeta.kind ?? "user",
    kind: "agent.notify",
    body: {
      text: notifyBoardText(notified),
      agentNotify: notified,
    },
  });
  return notified;
}

async function inviteUnlinkedPeer(
  actor: User,
  email: string,
  peer: User | null,
  origin: string,
  title: string,
  actorMeta: ScheduleActor,
): Promise<WaitingPeer> {
  const link = await createInviteLink({
    fromUser: actor,
    toEmail: email,
    toName: peer?.name ?? null,
    origin,
  });
  let guestUrl: string | null = null;
  try {
    const guest = await createGuestTask({
      organizer: actor,
      taskType: "availability",
      title: `Pick a time: ${title}`,
      description: `${actor.name || actor.email} wants to meet. HoneyMatcha does not email you — this private link is how you reply.`,
      targetEmail: email,
      origin,
      actor: {
        kind: actorMeta.kind ?? "user",
        apiKeyId: actorMeta.apiKeyId ?? null,
      },
    });
    guestUrl = guest.guestUrl;
  } catch {
    guestUrl = null;
  }
  return {
    email,
    name: peer?.name ?? link.toName,
    userId: peer?.id ?? null,
    onHoneyMatcha: Boolean(peer),
    linked: false,
    inviteUrl: link.inviteUrl,
    guestUrl,
    reason: peer ? "invite_pending" : "not_on_honeymatcha",
  };
}

async function persistWaitingSchedule(opts: {
  actor: User;
  actorMeta: ScheduleActor;
  title: string;
  notes: string | null;
  durationMinutes: number;
  timezone: string;
  window: { start: Date; end: Date };
  idempotencyKey: string | null;
  waiting: WaitingPeer[];
  peerEmails: string[];
}) {
  const reusable = await findReusableOpenSession({
    userId: opts.actor.id,
    intentType: "schedule_meeting",
    waitingEmails: opts.peerEmails,
    title: opts.title,
  });
  if (reusable) {
    const payload = (reusable.payload ?? {}) as Record<string, unknown>;
    const existingWaiting = Array.isArray(payload.waitingFor)
      ? (payload.waitingFor as WaitingPeer[])
      : opts.waiting;
    const merged = opts.waiting.map((person) => {
      const prev = existingWaiting.find(
        (row) => row.email.toLowerCase() === person.email.toLowerCase(),
      );
      return {
        ...person,
        guestUrl: person.guestUrl || prev?.guestUrl || null,
        inviteUrl: person.inviteUrl || prev?.inviteUrl || "",
      };
    });
    const notified = await notifyAndRecord({
      actor: opts.actor,
      actorMeta: opts.actorMeta,
      sessionId: reusable.id,
      title: opts.title,
      recipients: merged.map((person) => ({
        userId: person.userId,
        email: person.email,
        name: person.name,
      })),
    });
    return buildScheduleWaitingResult({
      sessionId: reusable.id,
      title: opts.title,
      waiting: merged,
      agentNotify: notified,
    });
  }

  const knownPeer = opts.waiting.length === 1 ? opts.waiting[0] : null;
  const db = getDb();
  const session = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(sessions)
      .values({
        intentType: "schedule_meeting",
        initiatorUserId: opts.actor.id,
        peerUserId: knownPeer?.userId ?? null,
        linkId: null,
        status: "open",
        idempotencyKey: opts.idempotencyKey,
        payload: {
          phase: "waiting_for_peer",
          durationMinutes: opts.durationMinutes,
          windowStart: opts.window.start.toISOString(),
          windowEnd: opts.window.end.toISOString(),
          timezone: opts.timezone,
          title: opts.title,
          notes: opts.notes,
          waitingFor: opts.waiting,
        },
      })
      .returning();

    await tx.insert(sessionParticipants).values([
      {
        sessionId: created.id,
        userId: opts.actor.id,
        email: opts.actor.email,
        role: "organizer" as const,
        linkId: null,
        voteStatus: "accepted",
      },
      ...opts.waiting
        .filter((person): person is WaitingPeer & { userId: string } =>
          Boolean(person.userId),
        )
        .map((person) => ({
          sessionId: created.id,
          userId: person.userId,
          email: person.email,
          role: "invitee" as const,
          linkId: null,
          voteStatus: "pending" as const,
        })),
    ]);

    await tx.insert(sessionMessages).values({
      sessionId: created.id,
      senderUserId: opts.actor.id,
      actorApiKeyId: opts.actorMeta.apiKeyId ?? null,
      actorKind: opts.actorMeta.kind ?? "user",
      kind: "waiting.peer",
      body: {
        text: `Waiting for ${opts.waiting
          .map((person) => person.name || person.email)
          .join(", ")} to join. HoneyMatcha does not email them — send them the invite link.`,
        title: opts.title,
        waitingFor: opts.waiting.map((person) => ({
          email: person.email,
          inviteUrl: person.inviteUrl,
          guestUrl: person.guestUrl,
        })),
      },
    });
    return created;
  });

  await writeAudit({
    actorUserId: opts.actor.id,
    actorApiKeyId: opts.actorMeta.apiKeyId ?? null,
    actorKind: opts.actorMeta.kind ?? "user",
    action: "session.start",
    entityType: "session",
    entityId: session.id,
    metadata: {
      title: opts.title,
      peerEmails: opts.peerEmails,
      phase: "waiting_for_peer",
    },
  });

  const notified = await notifyAndRecord({
    actor: opts.actor,
    actorMeta: opts.actorMeta,
    sessionId: session.id,
    title: opts.title,
    recipients: opts.waiting.map((person) => ({
      userId: person.userId,
      email: person.email,
      name: person.name,
    })),
  });

  return buildScheduleWaitingResult({
    sessionId: session.id,
    title: opts.title,
    waiting: opts.waiting,
    agentNotify: notified,
  });
}

async function ensureInviteeParticipants(
  sessionId: string,
  resolved: ResolvedPeer[],
) {
  const db = getDb();
  const existing = await participantsFor(sessionId);
  const have = new Set(existing.map((p) => p.userId));
  const missing = resolved.filter((row) => !have.has(row.peer.id));
  if (missing.length > 0) {
    await db.insert(sessionParticipants).values(
      missing.map(({ peer, actorLink }) => ({
        sessionId,
        userId: peer.id,
        email: peer.email,
        role: "invitee" as const,
        linkId: actorLink.id,
        voteStatus: "pending" as const,
      })),
    );
  }

  const primary = resolved[0];
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session || !primary) return;
  const payload = (session.payload ?? {}) as Record<string, unknown>;
  await db
    .update(sessions)
    .set({
      peerUserId:
        resolved.length === 1 ? primary.peer.id : session.peerUserId,
      linkId: resolved.length === 1 ? primary.actorLink.id : session.linkId,
      payload: {
        ...payload,
        phase:
          payload.phase === "waiting_for_peer" ||
          payload.phase === "waiting_for_calendars"
            ? "initiated"
            : payload.phase,
        waitingFor: [],
      },
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));
}

export async function runScheduleMeeting(
  actor: User,
  body: {
    peerEmail?: string;
    peerEmails?: string[];
    linkId?: string;
    durationMinutes?: number;
    windowStart?: string;
    windowEnd?: string;
    timezone?: string;
    title?: string;
    notes?: string;
    idempotencyKey?: string;
    origin?: string;
  },
  actorMeta: ScheduleActor = { kind: "user" },
) {
  await requireSupportedIntent("schedule_meeting");
  const peerEmails = [
    ...(body.peerEmail ? [body.peerEmail] : []),
    ...(body.peerEmails ?? []),
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (peerEmails.length === 0 && !body.linkId) {
    throw new AgentApiError(400, "peerEmail, peerEmails, or linkId is required");
  }

  const durationMinutes = Number(body.durationMinutes ?? 30);
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 5 ||
    durationMinutes > 8 * 60
  ) {
    throw new AgentApiError(
      400,
      "durationMinutes must be a whole number between 5 and 480",
    );
  }
  const window = parseScheduleWindow(body.windowStart, body.windowEnd);
  const title =
    boundedText(body.title, "title", 120) ?? "Meeting";
  const notes =
    boundedText(body.notes, "notes", 2_000) ?? null;
  const idempotencyKey =
    boundedText(body.idempotencyKey, "idempotencyKey", 160) ?? null;

  const db = getDb();
  let peers: User[] = [];
  const resolved: ResolvedPeer[] = [];

  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.initiatorUserId, actor.id),
          eq(sessions.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      return {
        ok: true,
        idempotent: true,
        session: existing,
        message: "This scheduling request was already received.",
      };
    }
  }

  if (body.linkId && peerEmails.length === 0) {
    const [link] = await db
      .select()
      .from(links)
      .where(and(eq(links.id, body.linkId), eq(links.status, "active")))
      .limit(1);
    if (!link) throw new AgentApiError(404, "Active link not found");
    if (link.fromUserId !== actor.id && link.toUserId !== actor.id) {
      throw new AgentApiError(403, "Not a party on this link");
    }
    const peerId =
      link.fromUserId === actor.id ? link.toUserId : link.fromUserId;
    if (!peerId) throw new AgentApiError(409, "Link has no accepted peer yet");
    const [peer] = await db
      .select()
      .from(users)
      .where(eq(users.id, peerId))
      .limit(1);
    if (!peer) throw new AgentApiError(404, "Peer user not found");
    peers = [peer];

    const relationshipRows = await db
      .select()
      .from(links)
      .where(
        and(
          eq(links.status, "active"),
          or(
            and(
              eq(links.fromUserId, actor.id),
              eq(links.toUserId, peer.id),
            ),
            and(
              eq(links.fromUserId, peer.id),
              eq(links.toUserId, actor.id),
            ),
          ),
        ),
      );
    const actorLink = findDirectionalLink(actor.id, peer.id, relationshipRows);
    const peerLink = findDirectionalLink(peer.id, actor.id, relationshipRows);
    if (!actorLink || !peerLink) {
      throw new AgentApiError(409, "Mutual relationship is incomplete");
    }
    assertLinkScopes(actorLink.scopes, SCHEDULE_SCOPES, peer.email);
    assertLinkScopes(peerLink.scopes, SCHEDULE_SCOPES, peer.email);
    resolved.push({ peer, actorLink, peerLink });
  } else {
    assertPeerCount(peerEmails.length);
    peers = await loadUsersByEmails(peerEmails);
    const found = new Set(peers.map((p) => p.email.toLowerCase()));
    const missing = peerEmails.filter((e) => !found.has(e));
    if (peers.some((p) => p.id === actor.id)) {
      throw new AgentApiError(400, "Cannot schedule with yourself");
    }

    const origin = (body.origin?.trim() || PRODUCTION_ORIGIN).replace(
      /\/$/,
      "",
    );
    const reusableWaiting = await findReusableOpenSession({
      userId: actor.id,
      intentType: "schedule_meeting",
      waitingEmails: peerEmails,
      title,
    });
    if (reusableWaiting) {
      const payload = (reusableWaiting.payload ?? {}) as Record<
        string,
        unknown
      >;
      if (
        payload.phase === "waiting_for_peer" &&
        Array.isArray(payload.waitingFor) &&
        payload.waitingFor.length > 0
      ) {
        return buildScheduleWaitingResult({
          sessionId: reusableWaiting.id,
          title,
          waiting: payload.waitingFor as WaitingPeer[],
        });
      }
    }

    const allIds = [actor.id, ...peers.map((p) => p.id)];
    const linkRows =
      allIds.length > 1
        ? await db
            .select()
            .from(links)
            .where(
              and(
                eq(links.status, "active"),
                or(
                  inArray(links.fromUserId, allIds),
                  inArray(links.toUserId, allIds),
                ),
              ),
            )
        : [];

    const waiting: WaitingPeer[] = [];
    for (const email of missing) {
      waiting.push(
        await inviteUnlinkedPeer(actor, email, null, origin, title, actorMeta),
      );
    }

    for (const peer of peers) {
      const actorLink = findDirectionalLink(actor.id, peer.id, linkRows);
      const peerLink = findDirectionalLink(peer.id, actor.id, linkRows);
      if (!actorLink || !peerLink) {
        waiting.push(
          await inviteUnlinkedPeer(
            actor,
            peer.email,
            peer,
            origin,
            title,
            actorMeta,
          ),
        );
        continue;
      }
      assertLinkScopes(actorLink.scopes, SCHEDULE_SCOPES, peer.email);
      assertLinkScopes(peerLink.scopes, SCHEDULE_SCOPES, peer.email);
      resolved.push({ peer, actorLink, peerLink });
    }

    if (waiting.length > 0) {
      return persistWaitingSchedule({
        actor,
        actorMeta,
        title,
        notes,
        durationMinutes,
        timezone: body.timezone?.trim() || "UTC",
        window,
        idempotencyKey,
        waiting,
        peerEmails,
      });
    }
  }
  assertPeerCount(resolved.length);

  const policy = mergeLinkPolicies(
    resolved.flatMap(({ actorLink, peerLink }) =>
      [actorLink, peerLink].map((link) => ({
        confirmRequired: link.confirmRequired,
        allowedHours: (link.allowedHours as AllowedHours | null) ?? null,
        timezone: link.timezone,
      })),
    ),
  );

  const primary = resolved[0]!;
  const timezone = body.timezone?.trim() || policy.timezone || "UTC";

  const reusableReady = await findReusableOpenSession({
    userId: actor.id,
    intentType: "schedule_meeting",
    peerUserId: peers.length === 1 ? primary.peer.id : null,
    waitingEmails: peers.map((p) => p.email),
    title,
  });
  if (reusableReady) {
    await ensureInviteeParticipants(reusableReady.id, resolved);
    await notifyAndRecord({
      actor,
      actorMeta,
      sessionId: reusableReady.id,
      title,
      recipients: resolved.map(({ peer }) => ({
        userId: peer.id,
        email: peer.email,
        name: peer.name,
      })),
    });
    return proposeAndGate(actor, reusableReady.id, actorMeta);
  }

  const session = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(sessions)
      .values({
        intentType: "schedule_meeting",
        initiatorUserId: actor.id,
        peerUserId: peers.length === 1 ? primary.peer.id : null,
        linkId: peers.length === 1 ? primary.actorLink.id : null,
        status: "open",
        idempotencyKey,
        payload: {
          phase: "initiated",
          durationMinutes,
          windowStart: window.start.toISOString(),
          windowEnd: window.end.toISOString(),
          timezone,
          title,
          notes,
          confirmRequired: policy.confirmRequired,
          policySnapshot: policy,
          participants: [
            { userId: actor.id, email: actor.email, role: "organizer" },
            ...resolved.map(({ peer }) => ({
              userId: peer.id,
              email: peer.email,
              role: "invitee" as const,
            })),
          ],
        },
      })
      .returning();

    await tx.insert(sessionParticipants).values([
      {
        sessionId: created.id,
        userId: actor.id,
        email: actor.email,
        role: "organizer" as const,
        linkId: null,
        voteStatus: "accepted",
      },
      ...resolved.map(({ peer, actorLink }) => ({
        sessionId: created.id,
        userId: peer.id,
        email: peer.email,
        role: "invitee" as const,
        linkId: actorLink.id,
        voteStatus: "pending",
      })),
    ]);

    await tx.insert(sessionMessages).values({
      sessionId: created.id,
      senderUserId: actor.id,
      actorApiKeyId: actorMeta.apiKeyId ?? null,
      actorKind: actorMeta.kind ?? "user",
      kind: "intent.schedule_meeting",
      body: {
        text: `Requested meeting: ${title}`,
        durationMinutes,
        windowStart: window.start.toISOString(),
        windowEnd: window.end.toISOString(),
        timezone,
        title,
        notes,
      },
    });
    return created;
  });

  await writeAudit({
    actorUserId: actor.id,
    actorApiKeyId: actorMeta.apiKeyId ?? null,
    actorKind: actorMeta.kind ?? "user",
    action: "session.start",
    entityType: "session",
    entityId: session.id,
    metadata: { title, peerEmails: peers.map((p) => p.email) },
  });

  await notifyAndRecord({
    actor,
    actorMeta,
    sessionId: session.id,
    title,
    recipients: resolved.map(({ peer }) => ({
      userId: peer.id,
      email: peer.email,
      name: peer.name,
    })),
  });

  try {
    return await proposeAndGate(actor, session.id, actorMeta);
  } catch (error) {
    const currentPayload = (session.payload ?? {}) as Record<string, unknown>;
    await db
      .update(sessions)
      .set({
        status: "cancelled",
        payload: {
          ...currentPayload,
          phase: "failed",
          error: {
            message:
              error instanceof Error ? error.message : "Scheduling failed",
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, session.id));
    throw error;
  }
}

async function proposeAndGate(
  actor: User,
  sessionId: string,
  actorMeta: ScheduleActor,
) {
  const db = getDb();
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session) throw new AgentApiError(404, "Session not found");

  const payload = (session.payload ?? {}) as Record<string, unknown>;
  const phase = String(payload.phase ?? "");
  if (phase === "confirmed" || session.status === "confirmed") {
    return {
      ok: true,
      scheduled: true,
      booked: true,
      session,
      calendar: { status: "booked", message: "Already booked on HoneyMatcha." },
      agent_instructions:
        "This meeting is already booked on HoneyMatcha. Do not send a second Google invite.",
    };
  }
  if (phase === "awaiting_confirm" || session.status === "accepted") {
    return {
      ok: true,
      scheduled: false,
      booked: false,
      session,
      calendar: {
        status: "awaiting_confirm",
        message:
          "Proposed via free/busy. Humans must approve before HoneyMatcha books.",
      },
      next_steps: [
        "Humans approve at /app/attention.",
        "Do not book this on Google Calendar yourself.",
      ],
      agent_instructions:
        "Do not book a Google Calendar event. Wait for humans to approve on HoneyMatcha.",
    };
  }
  if (phase === "proposing" || session.status === "proposed") {
    return {
      ok: true,
      scheduled: false,
      booked: false,
      session,
      calendar: {
        status: "proposed",
        message: "Times were already suggested. Waiting for confirmation.",
      },
      agent_instructions:
        "Do not book a Google Calendar event. Wait for the other person on HoneyMatcha.",
    };
  }

  const windowStart = String(payload.windowStart ?? "");
  const windowEnd = String(payload.windowEnd ?? "");
  const durationMinutes = Number(payload.durationMinutes ?? 30);
  const timezone = String(payload.timezone ?? "UTC");
  const title = String(payload.title ?? "Meeting");
  const confirmRequired = Boolean(payload.confirmRequired ?? true);
  const policySnapshot = (payload.policySnapshot ?? {}) as {
    confirmRequired?: boolean;
    allowedHours?: AllowedHours | null;
    timezone?: string | null;
    constraints?: Array<{
      allowedHours: AllowedHours;
      timezone: string;
    }>;
  };

  const parts = await participantsFor(sessionId);
  const emailsByUserId: Record<string, string> = {};
  for (const p of parts) emailsByUserId[p.userId] = p.email;

  const missingCalendars: string[] = [];
  for (const part of parts) {
    const status = await calendarConnectionStatus(part.userId);
    if (status === "none") missingCalendars.push(part.email);
  }
  if (missingCalendars.length > 0) {
    await db
      .update(sessions)
      .set({
        payload: {
          ...payload,
          phase: "waiting_for_calendars",
          missingCalendars,
        },
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));
    if (phase !== "waiting_for_calendars") {
      await db.insert(sessionMessages).values({
        sessionId,
        senderUserId: actor.id,
        actorApiKeyId: actorMeta.apiKeyId ?? null,
        actorKind: actorMeta.kind ?? "user",
        kind: "waiting.calendar",
        body: {
          text: `Waiting for a connected calendar from: ${missingCalendars.join(", ")}. HoneyMatcha will not pick a time from one calendar alone.`,
          missingCalendars,
        },
      });
    }
    return {
      ok: true,
      scheduled: false,
      booked: false,
      waiting_for_calendars: true,
      missingCalendars,
      sessionId,
      message: `Not booked. These people still need to connect Google Calendar on HoneyMatcha: ${missingCalendars.join(", ")}`,
      agent_instructions:
        "Do not book a Google Calendar event. Do not send a calendar invite yourself. Do not call create_session. Ask them to Connect Calendar at https://honeymatcha.io/app/settings.",
      next_steps: [
        "Ask each person missing a calendar to Connect Calendar at /app/settings.",
        "Then call request_schedule_meeting again.",
      ],
    };
  }

  const freeBusy = await collectFreeBusyForUsers({
    userIds: parts.map((p) => p.userId),
    emailsByUserId,
    timeMin: windowStart,
    timeMax: windowEnd,
  });

  await db.insert(sessionMessages).values({
    sessionId,
    senderUserId: actor.id,
    actorApiKeyId: actorMeta.apiKeyId ?? null,
    actorKind: actorMeta.kind ?? "user",
    kind: "avail.request",
    body: {
      text: `Collected free/busy from ${parts.length} calendars (${freeBusy.provider}).`,
      format: "free_busy",
      provider: freeBusy.provider,
      busyCount: freeBusy.busy.length,
    },
  });

  let proposedSlots = proposeFreeSlots({
    windowStart,
    windowEnd,
    durationMinutes,
    timezone,
    busy: freeBusy.busy,
  });

  const allowedHours = policySnapshot.allowedHours ?? null;
  const policyTz = policySnapshot.timezone || timezone;
  const constraints =
    policySnapshot.constraints?.length
      ? policySnapshot.constraints
      : [
          {
            allowedHours: {
              start: "09:00",
              end: "17:00",
              days: [1, 2, 3, 4, 5],
            },
            timezone: policyTz,
          },
        ];
  if (constraints.length) {
    proposedSlots = proposedSlots.filter((s) =>
      slotWithinAllAllowedHours(s, constraints),
    );
  }

  if (proposedSlots.length === 0) {
    await db
      .update(sessions)
      .set({
        status: "cancelled",
        payload: {
          ...payload,
          phase: "failed",
          proposedSlots: [],
          error: { code: "no_overlap", message: "No free slots in window" },
        },
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));
    throw new AgentApiError(
      409,
      "No free slots of requested duration in the window",
      { sessionId },
    );
  }

  const acceptedSlot = proposedSlots[0]!;
  await db
    .update(sessions)
    .set({
      status: "proposed",
      payload: {
        ...payload,
        phase: "proposing",
        proposedSlots,
        acceptedSlot,
        calendarProvider: freeBusy.provider,
      },
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));

  await db.insert(sessionMessages).values({
    sessionId,
    senderUserId: actor.id,
    actorApiKeyId: actorMeta.apiKeyId ?? null,
    actorKind: actorMeta.kind ?? "user",
    kind: "slot.propose",
    body: {
      text: `Proposed ${proposedSlots.length} free slot(s).`,
      slots: proposedSlots,
      provider: freeBusy.provider,
    },
  });

  await writeAudit({
    actorUserId: actor.id,
    actorApiKeyId: actorMeta.apiKeyId ?? null,
    actorKind: actorMeta.kind ?? "user",
    action: "session.propose",
    entityType: "session",
    entityId: sessionId,
    metadata: { slotCount: proposedSlots.length, provider: freeBusy.provider },
  });

  await notifyAndRecord({
    actor,
    actorMeta,
    sessionId,
    title,
    kind: "schedule.proposed",
    recipients: parts
      .filter((part) => part.userId !== actor.id)
      .map((part) => ({
        userId: part.userId,
        email: part.email,
        name: null,
      })),
  });

  const auto = shouldAutoBook({
    confirmRequired,
    allowedHours,
    timezone: policyTz,
    slot: acceptedSlot,
  });

  if (auto) {
    return bookMeeting(
      actor,
      sessionId,
      {
        acceptedBy: "policy",
        note: "auto_book: confirm_required=false and slot within allowed hours",
      },
      actorMeta,
    );
  }

  const confirmRows = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(confirms)
      .values(
        parts.map((participant) => ({
          sessionId,
          userId: participant.userId,
          action: "book_meeting",
          note: "Awaiting your confirmation before calendar booking",
          status: "pending" as const,
          metadata: {
            gate: "schedule_meeting",
            slot: acceptedSlot,
            title,
          },
        })),
      )
      .returning();

    await tx
      .update(sessions)
      .set({
        status: "accepted",
        payload: {
          ...payload,
          phase: "awaiting_confirm",
          proposedSlots,
          acceptedSlot,
          calendarProvider: freeBusy.provider,
        },
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    await tx.insert(sessionMessages).values({
      sessionId,
      senderUserId: actor.id,
      actorApiKeyId: actorMeta.apiKeyId ?? null,
      actorKind: actorMeta.kind ?? "user",
      kind: "confirm.requested",
      body: {
        text: `Confirmation requested for ${title}`,
        confirmIds: rows.map((confirm) => confirm.id),
        slot: acceptedSlot,
        action: "book_meeting",
      },
    });
    return rows;
  });

  await writeAudit({
    actorUserId: actor.id,
    actorApiKeyId: actorMeta.apiKeyId ?? null,
    actorKind: actorMeta.kind ?? "user",
    action: "confirm.requested",
    entityType: "session",
    entityId: sessionId,
    metadata: { count: confirmRows.length },
  });

  const [fresh] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  return {
    ok: true,
    session: {
      id: fresh.id,
      intentType: fresh.intentType,
      status: fresh.status,
      linkId: fresh.linkId,
      peerUserId: fresh.peerUserId,
      payload: fresh.payload,
      participants: parts.map((p) => ({
        userId: p.userId,
        email: p.email,
        role: p.role,
        voteStatus: p.voteStatus,
      })),
      createdAt: fresh.createdAt,
    },
    confirms: confirmRows.map((c) => ({
      id: c.id,
      userId: c.userId,
      action: c.action,
      status: c.status,
      note: c.note,
    })),
    proposedSlots,
    calendar: {
      status: "awaiting_confirm",
      provider: freeBusy.provider,
      message:
        "Proposed via free/busy. Human confirms required before booking. Do not send a Google invite yourself.",
    },
    next_steps: [
      "Humans approve at /app/attention.",
      "When all participants approve, HoneyMatcha books the real connected calendar event.",
      "Do not book this meeting on Google Calendar yourself.",
    ],
    agent_instructions:
      "Do not book a Google Calendar event and do not tell the human it is confirmed until HoneyMatcha returns calendar.status booked.",
  };
}

/**
 * After a confirm is approved/denied via UI or agent API, try to book
 * when all participants have approved. Returns booking result or null.
 */
export async function tryBookAfterConfirmApprovals(
  actor: User,
  sessionId: string,
  actorMeta: ScheduleActor = { kind: "user" },
): Promise<Record<string, unknown> | null> {
  const db = getDb();
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session || session.intentType !== "schedule_meeting") return null;

  const payload = (session.payload ?? {}) as Record<string, unknown>;
  if (payload.phase === "confirmed" || session.status === "confirmed") {
    return null;
  }
  if (payload.phase !== "awaiting_confirm" && session.status !== "accepted") {
    return null;
  }

  const parts = await participantsFor(sessionId);
  const pendingConfirms = await db
    .select()
    .from(confirms)
    .where(
      and(eq(confirms.sessionId, sessionId), eq(confirms.status, "pending")),
    );
  if (pendingConfirms.length > 0) {
    return {
      ok: true,
      calendar: {
        status: "awaiting_peer_confirms",
        message: "Waiting for remaining participants to approve.",
      },
    };
  }

  const denied = await db
    .select()
    .from(confirms)
    .where(
      and(eq(confirms.sessionId, sessionId), eq(confirms.status, "denied")),
    );
  if (denied.length > 0) {
    await completeWaitingSageScheduleJobs(sessionId, {
      ok: true,
      sessionId,
      sessionStatus: "declined",
      calendarStatus: "not_booked",
      waitingForHuman: false,
      message: "A participant declined the proposed meeting.",
    });
    return null;
  }

  // All non-pending should be approved for each participant
  const approved = await db
    .select()
    .from(confirms)
    .where(
      and(eq(confirms.sessionId, sessionId), eq(confirms.status, "approved")),
    );
  const approvedUsers = new Set(approved.map((c) => c.userId));
  const allApproved = parts.every((p) => approvedUsers.has(p.userId));
  if (!allApproved) {
    return {
      ok: true,
      calendar: {
        status: "awaiting_peer_confirms",
        message: "Waiting for remaining participants to approve.",
      },
    };
  }

  const booking = await bookMeeting(
    actor,
    sessionId,
    { acceptedBy: "user" },
    actorMeta,
  );
  const calendar = booking.calendar as Record<string, unknown>;
  await completeWaitingSageScheduleJobs(sessionId, {
    ok: true,
    sessionId,
    sessionStatus: "confirmed",
    calendarStatus: calendar.status ?? "booked",
    waitingForHuman: false,
    message: "The meeting was booked after every required approval.",
  });
  return booking;
}

async function bookMeeting(
  actor: User,
  sessionId: string,
  meta: { acceptedBy: "user" | "policy"; note?: string },
  actorMeta: ScheduleActor,
) {
  const db = getDb();
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session) throw new AgentApiError(404, "Session not found");

  const payload = (session.payload ?? {}) as Record<string, unknown>;
  const slot = (payload.acceptedSlot ??
    (Array.isArray(payload.proposedSlots)
      ? (payload.proposedSlots as SessionSlot[])[0]
      : null)) as SessionSlot | null;
  if (!slot) throw new AgentApiError(409, "No accepted slot to book");

  const parts = await participantsFor(sessionId);
  const organizerId = session.initiatorUserId;
  const calendar = await getCalendarPortForUser(organizerId);
  if (process.env.NODE_ENV === "production" && calendar.provider === "mock") {
    throw new AgentApiError(
      409,
      "Connect a real calendar before booking. No simulated event was created.",
      {
        code: "calendar_not_connected",
        agent_instructions:
          "Tell the human to Connect Calendar at /app/settings. Do not call create_session. Do not book a Google Calendar event yourself.",
      },
    );
  }

  const [claimed] = await db
    .update(sessions)
    .set({
      payload: { ...payload, phase: "booking" },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sessions.id, sessionId),
        sql`${sessions.payload}->>'phase' in ('proposing', 'awaiting_confirm', 'book_failed')`,
      ),
    )
    .returning();

  if (!claimed) {
    const [current] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    return {
      ok: true,
      idempotent: true,
      session: current,
      calendar: {
        status:
          (current?.payload as Record<string, unknown> | null)?.phase ===
          "confirmed"
            ? "booked"
            : "booking_in_progress",
        message: "This booking is already being processed.",
      },
    };
  }

  let event: Awaited<ReturnType<typeof calendar.createEvent>>;
  try {
    event = await calendar.createEvent({
      requestId: `honeymatcha-${sessionId}`,
      title: String(payload.title ?? "Meeting"),
      start: slot.start,
      end: slot.end,
      timezone: slot.timezone || String(payload.timezone ?? "UTC"),
      attendeeEmails: parts.map((p) => p.email),
      notes: (payload.notes as string | null) ?? undefined,
    });
  } catch (error) {
    await db
      .update(sessions)
      .set({
        status: "accepted",
        payload: {
          ...payload,
          phase: "book_failed",
          bookingError:
            error instanceof Error ? error.message : "Calendar booking failed",
        },
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));
    throw error;
  }

  const nextPayload = {
    ...payload,
    phase: "confirmed",
    acceptedSlot: slot,
    calendarEvent: {
      provider: event.provider,
      eventId: event.eventId,
      htmlLink: event.htmlLink,
      meetLink: event.meetLink,
    },
  };

  await db.transaction(async (tx) => {
    await tx
      .update(sessions)
      .set({
        status: "confirmed",
        payload: nextPayload,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sessions.id, sessionId),
          sql`${sessions.payload}->>'phase' = 'booking'`,
        ),
      );

    await tx
      .update(sessionParticipants)
      .set({ voteStatus: "accepted" })
      .where(eq(sessionParticipants.sessionId, sessionId));

    await tx.insert(sessionMessages).values({
      sessionId,
      senderUserId: actor.id,
      actorApiKeyId: actorMeta.apiKeyId ?? null,
      actorKind: actorMeta.kind ?? "user",
      kind: "meeting.confirm",
      body: {
        text: `Booked via ${event.provider}${
          event.meetLink ? ` · Meet: ${event.meetLink}` : ""
        }`,
        acceptedBy: meta.acceptedBy,
        note: meta.note,
        calendarEvent: nextPayload.calendarEvent,
        slot,
      },
    });
  });

  await writeAudit({
    actorUserId: actor.id,
    actorApiKeyId: actorMeta.apiKeyId ?? null,
    actorKind: actorMeta.kind ?? "user",
    action: "meeting.booked",
    entityType: "session",
    entityId: sessionId,
    metadata: {
      provider: event.provider,
      eventId: event.eventId,
      meetLink: event.meetLink,
      acceptedBy: meta.acceptedBy,
    },
  });

  const [fresh] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  return {
    ok: true,
    session: {
      id: fresh.id,
      intentType: fresh.intentType,
      status: fresh.status,
      linkId: fresh.linkId,
      peerUserId: fresh.peerUserId,
      payload: fresh.payload,
      participants: parts.map((p) => ({
        userId: p.userId,
        email: p.email,
        role: p.role,
        voteStatus: "accepted",
      })),
      createdAt: fresh.createdAt,
    },
    calendar: {
      status: "booked",
      provider: event.provider,
      eventId: event.eventId,
      htmlLink: event.htmlLink,
      meetLink: event.meetLink,
      message: `Booked via ${event.provider} CalendarPort.`,
    },
    confirm:
      meta.acceptedBy === "policy"
        ? { action: "auto_book", note: meta.note }
        : undefined,
  };
}

export async function userParticipatesInSession(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(sessionParticipants)
    .where(
      and(
        eq(sessionParticipants.sessionId, sessionId),
        eq(sessionParticipants.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function sessionIdsForUser(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ sessionId: sessionParticipants.sessionId })
    .from(sessionParticipants)
    .where(eq(sessionParticipants.userId, userId));
  return rows.map((r) => r.sessionId);
}
