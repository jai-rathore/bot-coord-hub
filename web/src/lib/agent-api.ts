/**
 * Shared agent API business logic (Bearer-auth callers).
 * Used by /api/v1/* routes and the MCP tool dispatcher.
 *
 * Domain mutations for links/sessions/confirms live in dedicated libs so the
 * Clerk UI and Bearer/MCP paths share one coherent implementation.
 */

import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  confirms,
  intentProposals,
  links,
  sessionMessages,
  sessions,
  users,
  type Confirm,
  type User,
} from "@/db/schema";
import {
  findDedupeHits,
  isExactDedupeConflict,
  listRegistryIntents,
} from "@/lib/intents";
import { normalizeIntentName, slugify } from "@/lib/slug";
import type { AgentAuth } from "@/lib/agent-auth";
import {
  acceptInviteLink,
  createInviteLink,
  listLinksForUser,
  revokeLinkForUser,
} from "@/lib/links";
import {
  createSessionForUser,
  getSessionForUser,
  listMessagesForSession,
  listSessionsForUser,
  messageToPlainEnglish,
  postSessionMessage,
} from "@/lib/sessions";
import {
  decideConfirm,
  listConfirmsForUser,
  requestConfirm as requestConfirmForUser,
} from "@/lib/confirms";

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

function rethrowAsAgentError(err: unknown): never {
  if (err instanceof AgentApiError) throw err;
  const message = err instanceof Error ? err.message : "Request failed";
  const status =
    err &&
    typeof err === "object" &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : message.includes("DATABASE_URL")
        ? 503
        : 500;
  throw new AgentApiError(status, message);
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
  try {
    const rows = await listLinksForUser(auth.user, baseUrl ?? "");
    return { ok: true, links: rows };
  } catch (err) {
    rethrowAsAgentError(err);
  }
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
  try {
    const link = await createInviteLink({
      fromUser: auth.user,
      toEmail: body.toEmail,
      toName: body.toName,
      scopes: body.scopes,
      origin: baseUrl ?? "",
    });
    return {
      ok: true,
      link,
      message:
        "Share this link with a friend’s bot/human so they can accept and form a mutual link.",
    };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function acceptInvite(
  auth: AgentAuth,
  body: { inviteCode?: string },
  baseUrl?: string,
) {
  try {
    const result = await acceptInviteLink({
      user: auth.user,
      inviteCode: body.inviteCode ?? "",
      origin: baseUrl ?? "",
    });
    return {
      ok: true,
      link: result.link,
      pair: result.pair,
    };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function revokeLink(auth: AgentAuth, linkId: string) {
  try {
    const result = await revokeLinkForUser({ user: auth.user, linkId });
    return { ok: true, ...result };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function listSessions(auth: AgentAuth) {
  try {
    const rows = await listSessionsForUser(auth.user);
    return { ok: true, sessions: rows };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function createSession(
  auth: AgentAuth,
  body: {
    intentType?: string;
    peerUserId?: string;
    linkId?: string;
    payload?: Record<string, unknown>;
  },
) {
  try {
    if (!body.intentType?.trim()) {
      throw new AgentApiError(400, "intentType is required");
    }
    const session = await createSessionForUser({
      user: auth.user,
      intentType: body.intentType,
      peerUserId: body.peerUserId,
      linkId: body.linkId,
      payload: body.payload,
    });
    return { ok: true, session };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function readBoard(auth: AgentAuth, sessionId: string) {
  try {
    const session = await getSessionForUser(sessionId, auth.user.id);
    const messages = await listMessagesForSession(sessionId);
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
        plainEnglish: m.plainEnglish,
      })),
    };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function listBoardMessages(auth: AgentAuth, sessionId: string) {
  try {
    await getSessionForUser(sessionId, auth.user.id);
    const messages = await listMessagesForSession(sessionId);
    return { ok: true, messages };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function postBoardMessage(
  auth: AgentAuth,
  sessionId: string,
  body: { kind?: string; body?: Record<string, unknown>; text?: string },
) {
  try {
    const session = await getSessionForUser(sessionId, auth.user.id);
    const messageBody = {
      ...(body.body ?? {}),
      ...(body.text ? { text: body.text } : {}),
    };
    const message = await postSessionMessage({
      session,
      sender: auth.user,
      kind: body.kind ?? "note",
      body: messageBody,
    });
    return { ok: true, message };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

/** Agent discovery: live intents only (pending/rejected stay in the human registry). */
export async function listIntents(query?: string) {
  const intents = (await listRegistryIntents(query)).filter(
    (i) => i.status === "live",
  );
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
        triageQueuedAt: new Date(),
      })
      .returning();

    return { ok: true, proposal, triage: { queued: true } };
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
    if (link.fromUserId !== authUser.id && link.toUserId !== authUser.id) {
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

  const match = rows.find((l) => l.toEmail?.toLowerCase() === email);
  if (match) return match;

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
    body: {
      ...payload,
      text: `Requested a ${durationMinutes}m meeting${
        payload.title ? ` (“${payload.title}”)` : ""
      }.`,
    },
  });

  const [confirm] = await db
    .insert(confirms)
    .values({
      sessionId: session.id,
      userId: auth.user.id,
      action: "book_meeting",
      note: "Awaiting human confirmation before calendar booking",
      status: "pending",
      metadata: {
        gate: "schedule_meeting",
        calendarStub: true,
      },
    })
    .returning();

  await db.insert(sessionMessages).values({
    sessionId: session.id,
    senderUserId: auth.user.id,
    kind: "confirm.requested",
    body: {
      confirmId: confirm.id,
      action: confirm.action,
      note: confirm.note,
      text: `Confirmation requested: ${confirm.action}${
        confirm.note ? ` — ${confirm.note}` : ""
      }`,
    },
  });

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
      status: confirm.status,
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

export async function listConfirms(
  auth: AgentAuth,
  status?: Confirm["status"],
) {
  try {
    const rows = await listConfirmsForUser(auth.user, status);
    return {
      ok: true,
      confirms: rows,
      note: "Confirm responses are human-gated by default. Agents may record a decision only after explicit human OK.",
    };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function requestConfirm(
  auth: AgentAuth,
  body: {
    sessionId?: string;
    action?: string;
    note?: string;
    metadata?: Record<string, unknown>;
    confirmUserId?: string;
  },
) {
  try {
    if (!body.sessionId?.trim()) {
      throw new AgentApiError(400, "sessionId is required");
    }
    if (!body.action?.trim()) {
      throw new AgentApiError(400, "action is required");
    }
    const confirm = await requestConfirmForUser({
      user: auth.user,
      sessionId: body.sessionId,
      action: body.action,
      note: body.note,
      metadata: body.metadata,
      confirmUserId: body.confirmUserId,
    });
    return { ok: true, confirm };
  } catch (err) {
    rethrowAsAgentError(err);
  }
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
          eq(confirms.status, "pending"),
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
  if (confirmRow.status !== "pending") {
    throw new AgentApiError(409, `Confirm already ${confirmRow.status}`);
  }

  if (action === "defer") {
    const note =
      body.note?.trim() ||
      confirmRow.note ||
      "Deferred — still awaiting human decision";
    const [updated] = await db
      .update(confirms)
      .set({ note })
      .where(eq(confirms.id, confirmRow.id))
      .returning();

    const session = await getSessionForUser(confirmRow.sessionId, auth.user.id);
    await postSessionMessage({
      session,
      sender: auth.user,
      kind: "confirm.deferred",
      body: {
        confirmId: updated.id,
        action: updated.action,
        note: updated.note,
        text: `Deferred: ${updated.action}${
          updated.note ? ` — ${updated.note}` : ""
        }`,
      },
    });

    return {
      ok: true,
      confirm: {
        id: updated.id,
        sessionId: updated.sessionId,
        action: updated.action,
        status: updated.status,
        note: updated.note,
        createdAt: updated.createdAt,
      },
      calendar: {
        status: "stub",
        message: "Deferred. Still awaiting a final human decision.",
      },
      documentation:
        "respond_confirm is human-gated: call only after your human approved/declined. Dashboard: /app/confirm.",
    };
  }

  try {
    const decision = action === "approve" ? "approved" : "denied";
    const confirm = await decideConfirm({
      user: auth.user,
      confirmId: confirmRow.id,
      decision,
      note: body.note,
    });

    return {
      ok: true,
      confirm: {
        id: confirm.id,
        sessionId: confirm.sessionId,
        action: confirm.action,
        status: confirm.status,
        note: confirm.note,
        createdAt: confirm.createdAt,
      },
      calendar: {
        status: "stub",
        message:
          "Decision recorded. Calendar booking is not auto-executed (calendar port missing).",
      },
      documentation:
        "respond_confirm is human-gated: call only after your human approved/declined. Dashboard: /app/confirm.",
    };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

// Re-export for callers that want plain-English helpers without importing sessions.
export { messageToPlainEnglish };
