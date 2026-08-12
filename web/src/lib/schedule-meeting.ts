/**
 * Production-shaped schedule_meeting flow:
 * linked peers → free/busy propose → confirm gate → CalendarPort book (+ Meet).
 */

import { and, eq, inArray, or } from "drizzle-orm";
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
import {
  collectFreeBusyForUsers,
  getCalendarPortForUser,
} from "@/lib/calendar";
import { proposeFreeSlots } from "@/lib/freebusy";
import {
  mergeLinkPolicies,
  shouldAutoBook,
  slotWithinAllowedHours,
} from "@/lib/policy";

const SCHEDULE_SCOPES = ["schedule_meeting", "avail.read_freebusy"];

function findActiveLink(a: string, b: string, rows: Link[]): Link | undefined {
  return rows.find(
    (l) =>
      l.status === "active" &&
      ((l.fromUserId === a && l.toUserId === b) ||
        (l.fromUserId === b && l.toUserId === a)),
  );
}

async function loadUsersByEmails(emails: string[]): Promise<User[]> {
  const normalized = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
  if (normalized.length === 0) return [];
  const db = getDb();
  const rows = await db.select().from(users);
  return rows.filter((u) => normalized.includes(u.email.toLowerCase()));
}

async function participantsFor(sessionId: string) {
  const db = getDb();
  return db
    .select()
    .from(sessionParticipants)
    .where(eq(sessionParticipants.sessionId, sessionId));
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
  },
) {
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
  if (!Number.isFinite(durationMinutes) || durationMinutes < 5) {
    throw new AgentApiError(400, "durationMinutes must be >= 5");
  }
  if (!body.windowStart || !body.windowEnd) {
    throw new AgentApiError(400, "windowStart and windowEnd are required");
  }

  const db = getDb();
  let peers: User[] = [];
  let resolved: Array<{ peer: User; link: Link }> = [];

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
    resolved = [{ peer, link }];
  } else {
    peers = await loadUsersByEmails(peerEmails);
    const found = new Set(peers.map((p) => p.email.toLowerCase()));
    const missing = peerEmails.filter((e) => !found.has(e));
    if (missing.length) {
      throw new AgentApiError(
        404,
        `No HoneyMatcha user for: ${missing.join(", ")}. They must accept a link invite first.`,
        { missing },
      );
    }
    if (peers.some((p) => p.id === actor.id)) {
      throw new AgentApiError(400, "Cannot schedule with yourself");
    }

    const allIds = [actor.id, ...peers.map((p) => p.id)];
    const linkRows = await db
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
      );

    for (const peer of peers) {
      const link = findActiveLink(actor.id, peer.id, linkRows);
      if (!link) {
        throw new AgentApiError(
          409,
          `No active link with ${peer.email}. Invite and accept first.`,
          { peerEmail: peer.email },
        );
      }
      const scopes = link.scopes ?? [];
      if (!SCHEDULE_SCOPES.every((s) => scopes.includes(s))) {
        throw new AgentApiError(
          403,
          `Link with ${peer.email} missing schedule_meeting / avail.read_freebusy scopes`,
        );
      }
      resolved.push({ peer, link });
    }
  }

  const policy = mergeLinkPolicies(
    resolved.map(({ link }) => ({
      confirmRequired: link.confirmRequired,
      allowedHours: (link.allowedHours as AllowedHours | null) ?? null,
      timezone: link.timezone,
    })),
  );

  const primary = resolved[0]!;
  const timezone = body.timezone?.trim() || policy.timezone || "UTC";
  const title = body.title?.trim() || "Meeting";

  const [session] = await db
    .insert(sessions)
    .values({
      intentType: "schedule_meeting",
      initiatorUserId: actor.id,
      peerUserId: peers.length === 1 ? primary.peer.id : null,
      linkId: peers.length === 1 ? primary.link.id : null,
      status: "open",
      payload: {
        phase: "initiated",
        durationMinutes,
        windowStart: body.windowStart,
        windowEnd: body.windowEnd,
        timezone,
        title,
        notes: body.notes?.trim() || null,
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

  await db.insert(sessionParticipants).values({
    sessionId: session.id,
    userId: actor.id,
    email: actor.email,
    role: "organizer",
    linkId: null,
    voteStatus: "accepted",
  });
  for (const { peer, link } of resolved) {
    await db.insert(sessionParticipants).values({
      sessionId: session.id,
      userId: peer.id,
      email: peer.email,
      role: "invitee",
      linkId: link.id,
      voteStatus: "pending",
    });
  }

  await db.insert(sessionMessages).values({
    sessionId: session.id,
    senderUserId: actor.id,
    kind: "intent.schedule_meeting",
    body: {
      text: `Requested meeting: ${title}`,
      durationMinutes,
      windowStart: body.windowStart,
      windowEnd: body.windowEnd,
      timezone,
      title,
      notes: body.notes?.trim() || null,
    },
  });

  await writeAudit({
    actorUserId: actor.id,
    action: "session.start",
    entityType: "session",
    entityId: session.id,
    metadata: { title, peerEmails: peers.map((p) => p.email) },
  });

  return proposeAndGate(actor, session.id);
}

async function proposeAndGate(actor: User, sessionId: string) {
  const db = getDb();
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session) throw new AgentApiError(404, "Session not found");

  const payload = (session.payload ?? {}) as Record<string, unknown>;
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
  };

  const parts = await participantsFor(sessionId);
  const emailsByUserId: Record<string, string> = {};
  for (const p of parts) emailsByUserId[p.userId] = p.email;

  const freeBusy = await collectFreeBusyForUsers({
    userIds: parts.map((p) => p.userId),
    emailsByUserId,
    timeMin: windowStart,
    timeMax: windowEnd,
  });

  await db.insert(sessionMessages).values({
    sessionId,
    senderUserId: actor.id,
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
  if (allowedHours) {
    proposedSlots = proposedSlots.filter((s) =>
      slotWithinAllowedHours(s, allowedHours, policyTz),
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
    kind: "slot.propose",
    body: {
      text: `Proposed ${proposedSlots.length} free slot(s).`,
      slots: proposedSlots,
      provider: freeBusy.provider,
    },
  });

  await writeAudit({
    actorUserId: actor.id,
    action: "session.propose",
    entityType: "session",
    entityId: sessionId,
    metadata: { slotCount: proposedSlots.length, provider: freeBusy.provider },
  });

  const auto = shouldAutoBook({
    confirmRequired,
    allowedHours,
    timezone: policyTz,
    slot: acceptedSlot,
  });

  if (auto) {
    return bookMeeting(actor, sessionId, {
      acceptedBy: "policy",
      note: "auto_book: confirm_required=false and slot within allowed hours",
    });
  }

  const confirmRows = [];
  for (const p of parts) {
    const [confirm] = await db
      .insert(confirms)
      .values({
        sessionId,
        userId: p.userId,
        action: "book_meeting",
        note: "Awaiting human confirmation before calendar booking",
        status: "pending",
        metadata: {
          gate: "schedule_meeting",
          slot: acceptedSlot,
          title,
        },
      })
      .returning();
    confirmRows.push(confirm);
  }

  await db
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

  await db.insert(sessionMessages).values({
    sessionId,
    senderUserId: actor.id,
    kind: "confirm.requested",
    body: {
      text: `Confirmation requested for ${title}`,
      confirmIds: confirmRows.map((c) => c.id),
      slot: acceptedSlot,
      action: "book_meeting",
    },
  });

  await writeAudit({
    actorUserId: actor.id,
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
        "Proposed via free/busy. Human confirms required before booking.",
    },
    next_steps: [
      "Humans approve at /app/confirm (or agents call respond_confirm after human OK).",
      "When all participants approve, CalendarPort books the event (Mock or Google + Meet).",
    ],
  };
}

/**
 * After a confirm is approved/denied via UI or agent API, try to book
 * when all participants have approved. Returns booking result or null.
 */
export async function tryBookAfterConfirmApprovals(
  actor: User,
  sessionId: string,
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

  return bookMeeting(actor, sessionId, { acceptedBy: "user" });
}

async function bookMeeting(
  actor: User,
  sessionId: string,
  meta: { acceptedBy: "user" | "policy"; note?: string },
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
  const event = await calendar.createEvent({
    title: String(payload.title ?? "Meeting"),
    start: slot.start,
    end: slot.end,
    timezone: slot.timezone || String(payload.timezone ?? "UTC"),
    attendeeEmails: parts.map((p) => p.email),
    notes: (payload.notes as string | null) ?? undefined,
  });

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

  await db
    .update(sessions)
    .set({
      status: "confirmed",
      payload: nextPayload,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));

  await db
    .update(sessionParticipants)
    .set({ voteStatus: "accepted" })
    .where(eq(sessionParticipants.sessionId, sessionId));

  await db.insert(sessionMessages).values({
    sessionId,
    senderUserId: actor.id,
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

  await writeAudit({
    actorUserId: actor.id,
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
