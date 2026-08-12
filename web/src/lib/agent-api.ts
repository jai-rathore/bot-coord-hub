/**
 * Shared agent API business logic (Bearer-auth callers).
 * Used by /api/v1/* routes and the MCP tool dispatcher.
 */

import { and, desc, eq, or } from "drizzle-orm";
import { randomBytes } from "crypto";
import { getDb } from "@/db";
import {
  confirms,
  intentProposals,
  links,
  sessionMessages,
  sessions,
  users,
  type User,
} from "@/db/schema";
import {
  findDedupeHits,
  isExactDedupeConflict,
  listRegistryIntents,
} from "@/lib/intents";
import { normalizeIntentName, slugify } from "@/lib/slug";
import type { AgentAuth } from "@/lib/agent-auth";

export class AgentApiError extends Error {
  status: number;
  details?: Record<string, unknown>;
  constructor(
    status: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function inviteCode(): string {
  return randomBytes(9).toString("base64url");
}

function publicLink(
  row: typeof links.$inferSelect,
  baseUrl?: string,
) {
  return {
    id: row.id,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    toEmail: row.toEmail,
    toName: row.toName,
    status: row.status,
    scopes: row.scopes,
    inviteCode: row.inviteCode,
    inviteUrl: baseUrl
      ? `${baseUrl.replace(/\/$/, "")}/app/links?invite=${row.inviteCode}`
      : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function whoami(auth: AgentAuth) {
  return {
    ok: true,
    user: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
    },
    apiKey: {
      id: auth.apiKey.id,
      name: auth.apiKey.name,
      keyPrefix: auth.apiKey.keyPrefix,
      lastUsedAt: auth.apiKey.lastUsedAt,
    },
  };
}

export async function listLinks(auth: AgentAuth, baseUrl?: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(links)
    .where(
      or(eq(links.fromUserId, auth.user.id), eq(links.toUserId, auth.user.id)),
    )
    .orderBy(desc(links.createdAt));

  return {
    ok: true,
    links: rows.map((r) => publicLink(r, baseUrl)),
  };
}

export async function createInvite(
  auth: AgentAuth,
  body: {
    toEmail?: string;
    toName?: string;
    scopes?: string[];
  },
  baseUrl?: string,
) {
  const toEmail = body.toEmail?.trim().toLowerCase();
  if (!toEmail || !toEmail.includes("@")) {
    throw new AgentApiError(400, "toEmail is required");
  }
  if (toEmail === auth.user.email.toLowerCase()) {
    throw new AgentApiError(400, "Cannot invite yourself");
  }

  const scopes =
    body.scopes && body.scopes.length > 0
      ? body.scopes
      : ["schedule_meeting", "avail.read_freebusy"];

  const db = getDb();

  // If peer already has an account, attach toUserId eagerly (still pending until accept).
  const peer = await db
    .select()
    .from(users)
    .where(eq(users.email, toEmail))
    .limit(1);

  const [created] = await db
    .insert(links)
    .values({
      fromUserId: auth.user.id,
      toUserId: peer[0]?.id ?? null,
      toEmail,
      toName: body.toName?.trim() || peer[0]?.name || null,
      inviteCode: inviteCode(),
      status: "pending",
      scopes,
    })
    .returning();

  return {
    ok: true,
    link: publicLink(created, baseUrl),
    message:
      "Share the inviteCode / inviteUrl out-of-band. Peer accepts with POST /api/v1/links/accept.",
  };
}

export async function acceptInvite(
  auth: AgentAuth,
  body: { inviteCode?: string },
  baseUrl?: string,
) {
  const code = body.inviteCode?.trim();
  if (!code) {
    throw new AgentApiError(400, "inviteCode is required");
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(links)
    .where(eq(links.inviteCode, code))
    .limit(1);

  const link = rows[0];
  if (!link) {
    throw new AgentApiError(404, "Invite not found");
  }
  if (link.status === "revoked") {
    throw new AgentApiError(410, "Invite was revoked");
  }
  if (link.status === "active") {
    throw new AgentApiError(409, "Invite already accepted");
  }
  if (link.fromUserId === auth.user.id) {
    throw new AgentApiError(400, "Cannot accept your own invite");
  }
  if (
    link.toEmail.toLowerCase() !== auth.user.email.toLowerCase() &&
    link.toUserId &&
    link.toUserId !== auth.user.id
  ) {
    throw new AgentApiError(
      403,
      "This invite is addressed to a different email",
    );
  }

  const [updated] = await db
    .update(links)
    .set({
      status: "active",
      toUserId: auth.user.id,
      toEmail: auth.user.email.toLowerCase(),
      toName: auth.user.name ?? link.toName,
      updatedAt: new Date(),
    })
    .where(eq(links.id, link.id))
    .returning();

  return {
    ok: true,
    link: publicLink(updated, baseUrl),
  };
}

export async function listSessions(auth: AgentAuth) {
  const db = getDb();
  const rows = await db
    .select()
    .from(sessions)
    .where(
      or(
        eq(sessions.initiatorUserId, auth.user.id),
        eq(sessions.peerUserId, auth.user.id),
      ),
    )
    .orderBy(desc(sessions.createdAt));

  return {
    ok: true,
    sessions: rows.map((s) => ({
      id: s.id,
      intentType: s.intentType,
      status: s.status,
      initiatorUserId: s.initiatorUserId,
      peerUserId: s.peerUserId,
      linkId: s.linkId,
      payload: s.payload,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  };
}

async function getAccessibleSession(auth: AgentAuth, sessionId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const session = rows[0];
  if (!session) {
    throw new AgentApiError(404, "Session not found");
  }
  if (
    session.initiatorUserId !== auth.user.id &&
    session.peerUserId !== auth.user.id
  ) {
    throw new AgentApiError(403, "Not a participant of this session");
  }
  return session;
}

export async function readBoard(auth: AgentAuth, sessionId: string) {
  const session = await getAccessibleSession(auth, sessionId);
  const db = getDb();
  const messages = await db
    .select()
    .from(sessionMessages)
    .where(eq(sessionMessages.sessionId, session.id))
    .orderBy(sessionMessages.createdAt);

  return {
    ok: true,
    session: {
      id: session.id,
      intentType: session.intentType,
      status: session.status,
      payload: session.payload,
      initiatorUserId: session.initiatorUserId,
      peerUserId: session.peerUserId,
      linkId: session.linkId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
    messages: messages.map((m) => ({
      id: m.id,
      kind: m.kind,
      body: m.body,
      senderUserId: m.senderUserId,
      createdAt: m.createdAt,
    })),
  };
}

export async function postBoardMessage(
  auth: AgentAuth,
  sessionId: string,
  body: { kind?: string; body?: Record<string, unknown> },
) {
  const session = await getAccessibleSession(auth, sessionId);
  const kind = (body.kind ?? "message").trim().slice(0, 80);
  if (!kind) {
    throw new AgentApiError(400, "kind is required");
  }
  const messageBody = body.body ?? {};

  const db = getDb();
  const [created] = await db
    .insert(sessionMessages)
    .values({
      sessionId: session.id,
      senderUserId: auth.user.id,
      kind,
      body: messageBody,
    })
    .returning();

  await db
    .update(sessions)
    .set({ updatedAt: new Date() })
    .where(eq(sessions.id, session.id));

  return {
    ok: true,
    message: {
      id: created.id,
      kind: created.kind,
      body: created.body,
      senderUserId: created.senderUserId,
      createdAt: created.createdAt,
    },
  };
}

export async function listIntents(query?: string) {
  const intents = await listRegistryIntents(query);
  return { ok: true, intents };
}

export async function proposeIntent(
  auth: AgentAuth,
  body: {
    name?: string;
    slug?: string;
    description?: string;
    force?: boolean;
  },
) {
  const name = normalizeIntentName(body.name ?? "");
  if (!name || name.length < 3) {
    throw new AgentApiError(400, "Name must be at least 3 characters");
  }
  const slug = slugify(body.slug || name);
  if (!slug) {
    throw new AgentApiError(400, "Invalid slug");
  }
  const description = body.description?.trim() || null;
  const hits = await findDedupeHits(name, slug);
  const exact = isExactDedupeConflict(hits, name, slug);

  if (exact) {
    throw new AgentApiError(409, "An intent with this name or slug already exists", {
      hits,
    });
  }
  if (hits.length > 0 && !body.force) {
    throw new AgentApiError(
      409,
      "Similar intents found. Review matches or resubmit with force=true.",
      { hits, requiresForce: true },
    );
  }

  const db = getDb();
  try {
    const [proposal] = await db
      .insert(intentProposals)
      .values({
        name,
        slug,
        description,
        status: "pending",
        proposedByUserId: auth.user.id,
        proposedByEmail: auth.user.email,
      })
      .returning();

    return { ok: true, proposal };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.includes("unique") || message.includes("duplicate")) {
      throw new AgentApiError(409, "Slug already taken", { hits });
    }
    throw new AgentApiError(503, message);
  }
}

async function findActiveLinkWithPeer(
  authUser: User,
  peerEmail?: string,
  linkId?: string,
) {
  const db = getDb();

  if (linkId) {
    const rows = await db
      .select()
      .from(links)
      .where(and(eq(links.id, linkId), eq(links.status, "active")))
      .limit(1);
    const link = rows[0];
    if (!link) {
      throw new AgentApiError(404, "Active link not found");
    }
    if (
      link.fromUserId !== authUser.id &&
      link.toUserId !== authUser.id
    ) {
      throw new AgentApiError(403, "Not a party on this link");
    }
    return link;
  }

  if (!peerEmail) {
    throw new AgentApiError(400, "peerEmail or linkId is required");
  }
  const email = peerEmail.trim().toLowerCase();

  const rows = await db
    .select()
    .from(links)
    .where(
      and(
        eq(links.status, "active"),
        or(eq(links.fromUserId, authUser.id), eq(links.toUserId, authUser.id)),
      ),
    );

  const match = rows.find((l) => {
    if (l.toEmail.toLowerCase() === email) return true;
    return false;
  });

  if (match) return match;

  // Also match when peer is the from side (we are invitee)
  const peerUsers = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const peer = peerUsers[0];
  if (peer) {
    const byPeer = rows.find(
      (l) => l.fromUserId === peer.id || l.toUserId === peer.id,
    );
    if (byPeer) return byPeer;
  }

  throw new AgentApiError(
    404,
    "No active link with that peer. Create/accept an invite first.",
  );
}

/**
 * request_schedule_meeting — creates a session + human confirm gate.
 * Does NOT auto-book calendar (calendar port stub).
 */
export async function requestScheduleMeeting(
  auth: AgentAuth,
  body: {
    peerEmail?: string;
    linkId?: string;
    durationMinutes?: number;
    windowStart?: string;
    windowEnd?: string;
    timezone?: string;
    title?: string;
    notes?: string;
  },
) {
  const link = await findActiveLinkWithPeer(
    auth.user,
    body.peerEmail,
    body.linkId,
  );

  const peerUserId =
    link.fromUserId === auth.user.id ? link.toUserId : link.fromUserId;

  const durationMinutes = Number(body.durationMinutes ?? 30);
  if (!Number.isFinite(durationMinutes) || durationMinutes < 5) {
    throw new AgentApiError(400, "durationMinutes must be >= 5");
  }

  const payload = {
    durationMinutes,
    windowStart: body.windowStart ?? null,
    windowEnd: body.windowEnd ?? null,
    timezone: body.timezone ?? "UTC",
    title: body.title?.trim() || "Meeting",
    notes: body.notes?.trim() || null,
    calendar: {
      status: "stub",
      message:
        "Calendar port not connected. Session + confirm gate created; no calendar event was booked.",
    },
  };

  const db = getDb();
  const [session] = await db
    .insert(sessions)
    .values({
      intentType: "schedule_meeting",
      initiatorUserId: auth.user.id,
      peerUserId: peerUserId,
      linkId: link.id,
      status: "open",
      payload,
    })
    .returning();

  await db.insert(sessionMessages).values({
    sessionId: session.id,
    senderUserId: auth.user.id,
    kind: "schedule.request",
    body: payload,
  });

  // Human confirm gate — organizer must approve before any booking.
  const [confirm] = await db
    .insert(confirms)
    .values({
      sessionId: session.id,
      userId: auth.user.id,
      action: "pending",
      note: "Awaiting human confirmation before calendar booking",
      metadata: {
        gate: "schedule_meeting",
        calendarStub: true,
      },
    })
    .returning();

  return {
    ok: true,
    session: {
      id: session.id,
      intentType: session.intentType,
      status: session.status,
      linkId: session.linkId,
      peerUserId: session.peerUserId,
      payload: session.payload,
      createdAt: session.createdAt,
    },
    confirm: {
      id: confirm.id,
      action: confirm.action,
      note: confirm.note,
    },
    calendar: payload.calendar,
    next_steps: [
      "Post free/busy or proposals to the session board (POST /api/v1/sessions/:id/messages).",
      "Human reviews at /app/confirm (or agent calls respond_confirm after human OK).",
      "Calendar auto-book remains stubbed until a calendar port is wired.",
    ],
  };
}

export async function listConfirms(auth: AgentAuth) {
  const db = getDb();
  const rows = await db
    .select()
    .from(confirms)
    .where(eq(confirms.userId, auth.user.id))
    .orderBy(desc(confirms.createdAt));

  return {
    ok: true,
    confirms: rows.map((c) => ({
      id: c.id,
      sessionId: c.sessionId,
      action: c.action,
      note: c.note,
      metadata: c.metadata,
      createdAt: c.createdAt,
    })),
    note: "Confirm responses are human-gated by default. Agents may record a decision only after explicit human OK.",
  };
}

/**
 * respond_confirm — records human decision on a confirm gate.
 * Agents should only call this after the human approved/declined.
 * Does not book calendar (stub).
 */
export async function respondConfirm(
  auth: AgentAuth,
  body: {
    confirmId?: string;
    sessionId?: string;
    action?: string;
    note?: string;
  },
) {
  const action = body.action?.trim().toLowerCase();
  if (!action || !["approve", "decline", "defer"].includes(action)) {
    throw new AgentApiError(
      400,
      "action must be one of: approve, decline, defer",
    );
  }

  const db = getDb();
  let confirmRow =
    body.confirmId
      ? (
          await db
            .select()
            .from(confirms)
            .where(eq(confirms.id, body.confirmId))
            .limit(1)
        )[0]
      : undefined;

  if (!confirmRow && body.sessionId) {
    const pending = await db
      .select()
      .from(confirms)
      .where(
        and(
          eq(confirms.sessionId, body.sessionId),
          eq(confirms.userId, auth.user.id),
          eq(confirms.action, "pending"),
        ),
      )
      .orderBy(desc(confirms.createdAt))
      .limit(1);
    confirmRow = pending[0];
  }

  if (!confirmRow) {
    throw new AgentApiError(404, "Confirm not found");
  }
  if (confirmRow.userId !== auth.user.id) {
    throw new AgentApiError(403, "Not your confirm gate");
  }

  // Insert a new audit row for the decision (keep pending history).
  const [decision] = await db
    .insert(confirms)
    .values({
      sessionId: confirmRow.sessionId,
      userId: auth.user.id,
      action,
      note:
        body.note?.trim() ||
        `Recorded via agent API after human ${action}`,
      metadata: {
        priorConfirmId: confirmRow.id,
        calendarStub: true,
        humanGated: true,
      },
    })
    .returning();

  // Mark original pending as superseded in note via update
  if (confirmRow.action === "pending") {
    await db
      .update(confirms)
      .set({
        action: `superseded_by_${action}`,
        note: confirmRow.note,
      })
      .where(eq(confirms.id, confirmRow.id));
  }

  if (action === "approve") {
    await db
      .update(sessions)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(sessions.id, confirmRow.sessionId));
  } else if (action === "decline") {
    await db
      .update(sessions)
      .set({ status: "declined", updatedAt: new Date() })
      .where(eq(sessions.id, confirmRow.sessionId));
  }

  return {
    ok: true,
    confirm: {
      id: decision.id,
      sessionId: decision.sessionId,
      action: decision.action,
      note: decision.note,
      createdAt: decision.createdAt,
    },
    calendar: {
      status: "stub",
      message:
        "Decision recorded. Calendar booking is not auto-executed (calendar port missing).",
    },
    documentation:
      "respond_confirm is human-gated: call only after your human approved/declined. Dashboard: /app/confirm.",
  };
}
