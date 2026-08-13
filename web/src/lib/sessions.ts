import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  links,
  sessionMessages,
  sessionParticipants,
  sessions,
  users,
  type Session,
  type SessionMessage,
  type User,
} from "@/db/schema";
import { AgentApiError } from "@/lib/agent-errors";
import { requireSupportedIntent } from "@/lib/intent-gate";
import {
  assertLinkScopes,
  INTENT_REQUIRED_LINK_SCOPES,
} from "@/lib/scopes";
import { assertPayloadSize, boundedText } from "@/lib/validation";

export type PublicParticipant = {
  userId: string;
  email: string;
  role: string;
  voteStatus: string;
};

export type PublicSession = {
  id: string;
  intentType: string;
  status: Session["status"];
  initiatorUserId: string;
  peerUserId: string | null;
  linkId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  peer: { id: string; email: string; name: string | null } | null;
  participants: PublicParticipant[];
  multiParty: boolean;
};

export type PublicMessage = {
  id: string;
  sessionId: string;
  senderUserId: string | null;
  actorKind: string;
  kind: string;
  body: Record<string, unknown>;
  createdAt: string;
  plainEnglish: string;
};

export function messageToPlainEnglish(
  kind: string,
  body: Record<string, unknown>,
): string {
  const text =
    typeof body.text === "string"
      ? body.text
      : typeof body.summary === "string"
        ? body.summary
        : null;

  switch (kind) {
    case "note":
      return text ?? "Posted a note on the session board.";
    case "system":
      return text ?? "System update.";
    case "confirm.requested":
      return (
        text ??
        `Confirmation requested: ${String(body.action ?? "action")}${
          body.note ? ` — ${String(body.note)}` : ""
        }`
      );
    case "confirm.approved":
      return (
        text ??
        `Approved: ${String(body.action ?? "action")}${
          body.note ? ` — ${String(body.note)}` : ""
        }`
      );
    case "confirm.denied":
      return (
        text ??
        `Denied: ${String(body.action ?? "action")}${
          body.note ? ` — ${String(body.note)}` : ""
        }`
      );
    case "link.accepted":
      return text ?? "Peer link accepted. You can coordinate on this session.";
    case "avail.offer":
      return text ?? "Shared available times (busy times only — no event titles).";
    case "avail.request":
      return text ?? "Looked up calendars (busy times only).";
    case "slot.propose":
      return text ?? "Proposed meeting time(s) from overlapping free time.";
    case "slot.accept":
      return text ?? "Accepted a proposed time.";
    case "proposal":
      return (
        text ??
        (typeof body.title === "string" && body.title.trim()
          ? `Suggested: ${body.title.trim()}`
          : "Suggested a meeting.")
      );
    case "intent.schedule_meeting":
      return (
        text ??
        (typeof body.title === "string" && body.title.trim()
          ? `Started coordinating: ${body.title.trim()}`
          : "Started coordinating a meeting.")
      );
    case "meeting.confirm":
      return text ?? "Booked on the connected calendar.";
    case "waiting.peer":
      return text ?? "Waiting for the other person to join HoneyMatcha.";
    case "waiting.calendar":
      return text ?? "Waiting for everyone to connect a calendar.";
    default: {
      if (text) return text;
      if (typeof body.title === "string" && body.title.trim()) {
        return body.title.trim();
      }
      return "Update from your agent.";
    }
  }
}

export function assertSessionParticipant(session: Session, userId: string) {
  if (session.initiatorUserId !== userId && session.peerUserId !== userId) {
    throw Object.assign(new Error("Not a participant on this session"), {
      status: 403,
    });
  }
}

async function isSessionParticipant(
  session: Session,
  userId: string,
): Promise<boolean> {
  if (session.initiatorUserId === userId || session.peerUserId === userId) {
    return true;
  }
  const db = getDb();
  const [row] = await db
    .select()
    .from(sessionParticipants)
    .where(
      and(
        eq(sessionParticipants.sessionId, session.id),
        eq(sessionParticipants.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function listSessionsForUser(
  user: User,
): Promise<PublicSession[]> {
  const db = getDb();
  const partRows = await db
    .select({ sessionId: sessionParticipants.sessionId })
    .from(sessionParticipants)
    .where(eq(sessionParticipants.userId, user.id));
  const partIds = partRows.map((r) => r.sessionId);

  const rows = await db
    .select()
    .from(sessions)
    .where(
      partIds.length > 0
        ? or(
            eq(sessions.initiatorUserId, user.id),
            eq(sessions.peerUserId, user.id),
            inArray(sessions.id, partIds),
          )
        : or(
            eq(sessions.initiatorUserId, user.id),
            eq(sessions.peerUserId, user.id),
          ),
    )
    .orderBy(desc(sessions.updatedAt));

  const peerIds = new Set<string>();
  for (const row of rows) {
    const peerId =
      row.initiatorUserId === user.id ? row.peerUserId : row.initiatorUserId;
    if (peerId) peerIds.add(peerId);
  }

  const peerMap = new Map<string, User>();
  for (const id of peerIds) {
    const found = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (found[0]) peerMap.set(id, found[0]);
  }

  const ids = rows.map((r) => r.id);
  const allParts =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(sessionParticipants)
          .where(inArray(sessionParticipants.sessionId, ids));

  return rows.map((row) => {
    const peerId =
      row.initiatorUserId === user.id ? row.peerUserId : row.initiatorUserId;
    const peer = peerId ? peerMap.get(peerId) ?? null : null;
    const participants = allParts
      .filter((p) => p.sessionId === row.id)
      .map((p) => ({
        userId: p.userId,
        email: p.email,
        role: p.role,
        voteStatus: p.voteStatus,
      }));
    return toPublicSession(row, peer, participants);
  });
}

export async function createSessionForUser(opts: {
  user: User;
  intentType: string;
  peerUserId?: string | null;
  linkId?: string | null;
  payload?: Record<string, unknown>;
  idempotencyKey?: string | null;
}): Promise<PublicSession> {
  const intentType = boundedText(opts.intentType, "intentType", 80, {
    required: true,
  })!;
  await requireSupportedIntent(intentType);
  assertPayloadSize(opts.payload);

  const db = getDb();
  let peerUserId = opts.peerUserId ?? null;
  const requestedLinkId = opts.linkId ?? null;
  let canonicalLinkId: string | null = null;

  if (opts.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.initiatorUserId, opts.user.id),
          eq(sessions.idempotencyKey, opts.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return toPublicSession(existing, null, []);
  }

  if (requestedLinkId) {
    const linkRows = await db
      .select()
      .from(links)
      .where(and(eq(links.id, requestedLinkId), eq(links.status, "active")))
      .limit(1);
    const link = linkRows[0];
    if (!link) {
      throw Object.assign(new Error("Active link not found"), { status: 404 });
    }
    if (link.fromUserId !== opts.user.id && link.toUserId !== opts.user.id) {
      throw Object.assign(new Error("Not a party on this link"), {
        status: 403,
      });
    }
    peerUserId =
      link.fromUserId === opts.user.id ? link.toUserId : link.fromUserId;
    if (!peerUserId) {
      throw new AgentApiError(409, "Relationship has no accepted peer");
    }

    const relationshipRows = await db
      .select()
      .from(links)
      .where(
        and(
          eq(links.status, "active"),
          or(
            and(
              eq(links.fromUserId, opts.user.id),
              eq(links.toUserId, peerUserId),
            ),
            and(
              eq(links.fromUserId, peerUserId),
              eq(links.toUserId, opts.user.id),
            ),
          ),
        ),
      );
    const ownerLink = relationshipRows.find(
      (row) => row.fromUserId === opts.user.id,
    );
    const peerLink = relationshipRows.find(
      (row) => row.fromUserId === peerUserId,
    );
    if (!ownerLink || !peerLink) {
      throw new AgentApiError(409, "Mutual relationship is incomplete");
    }
    const requiredScopes = INTENT_REQUIRED_LINK_SCOPES[intentType] ?? [];
    assertLinkScopes(ownerLink.scopes, requiredScopes, "this person");
    assertLinkScopes(peerLink.scopes, requiredScopes, "this person");
    canonicalLinkId = ownerLink.id;
  } else if (peerUserId) {
    throw new AgentApiError(
      400,
      "A trusted relationship is required to start a task with another user",
    );
  }

  if (peerUserId === opts.user.id) {
    throw Object.assign(new Error("peerUserId cannot be yourself"), {
      status: 400,
    });
  }

  const title =
    typeof opts.payload?.title === "string" ? opts.payload.title : null;
  const reusable = await findReusableOpenSession({
    userId: opts.user.id,
    intentType,
    peerUserId,
    title,
  });
  if (reusable) {
    let existingPeer: User | null = null;
    if (reusable.peerUserId) {
      const found = await db
        .select()
        .from(users)
        .where(eq(users.id, reusable.peerUserId))
        .limit(1);
      existingPeer = found[0] ?? null;
    }
    const existingParts = await db
      .select()
      .from(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, reusable.id));
    return toPublicSession(
      reusable,
      existingPeer,
      existingParts.map((p) => ({
        userId: p.userId,
        email: p.email,
        role: p.role,
        voteStatus: p.voteStatus,
      })),
    );
  }

  const [created] = await db
    .insert(sessions)
    .values({
      intentType,
      initiatorUserId: opts.user.id,
      peerUserId,
      linkId: canonicalLinkId,
      status: "open",
      payload: opts.payload ?? {},
      idempotencyKey: opts.idempotencyKey ?? null,
    })
    .returning();

  let peer: User | null = null;
  if (peerUserId) {
    const found = await db
      .select()
      .from(users)
      .where(eq(users.id, peerUserId))
      .limit(1);
    peer = found[0] ?? null;
  }

  return toPublicSession(created, peer, []);
}

export async function getSessionForUser(
  sessionId: string,
  userId: string,
): Promise<Session> {
  const db = getDb();
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const session = rows[0];
  if (!session) {
    throw Object.assign(new Error("Session not found"), { status: 404 });
  }
  if (!(await isSessionParticipant(session, userId))) {
    throw Object.assign(new Error("Not a participant on this session"), {
      status: 403,
    });
  }
  return session;
}

export async function listMessagesForSession(
  sessionId: string,
): Promise<PublicMessage[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(sessionMessages)
    .where(eq(sessionMessages.sessionId, sessionId))
    .orderBy(asc(sessionMessages.createdAt));

  return rows.map(toPublicMessage);
}

export async function postSessionMessage(opts: {
  session: Session;
  sender: User;
  kind: string;
  body?: Record<string, unknown>;
  actorApiKeyId?: string | null;
  actorKind?: "user" | "agent" | "guest" | "system";
}): Promise<PublicMessage> {
  const kind = opts.kind.trim();
  if (!kind) {
    throw Object.assign(new Error("kind is required"), { status: 400 });
  }

  const db = getDb();
  const body = opts.body ?? {};
  assertPayloadSize(body, 8_192, "message body");

  const [created] = await db
    .insert(sessionMessages)
    .values({
      sessionId: opts.session.id,
      senderUserId: opts.sender.id,
      actorApiKeyId: opts.actorApiKeyId ?? null,
      actorKind: opts.actorKind ?? "user",
      kind,
      body,
    })
    .returning();

  await db
    .update(sessions)
    .set({ updatedAt: new Date() })
    .where(eq(sessions.id, opts.session.id));

  return toPublicMessage(created);
}

const REUSABLE_STATUSES: Session["status"][] = [
  "open",
  "proposed",
  "accepted",
];

function titlesMatch(left: string | null | undefined, right: string | null | undefined) {
  const a = (left ?? "").trim().toLowerCase();
  const b = (right ?? "").trim().toLowerCase();
  const blank = (value: string) => !value || value === "meeting";
  if (blank(a) && blank(b)) return true;
  return a === b;
}

export async function findReusableOpenSession(opts: {
  userId: string;
  intentType: string;
  peerUserId?: string | null;
  waitingEmails?: string[];
  title?: string | null;
}): Promise<Session | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.initiatorUserId, opts.userId),
        eq(sessions.intentType, opts.intentType),
      ),
    )
    .orderBy(desc(sessions.updatedAt))
    .limit(40);

  const wantedEmails = (opts.waitingEmails ?? [])
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
    .sort();

  for (const row of rows) {
    if (!REUSABLE_STATUSES.includes(row.status)) continue;
    const payload = (row.payload as Record<string, unknown>) ?? {};
    if (!titlesMatch(opts.title, typeof payload.title === "string" ? payload.title : null)) {
      continue;
    }

    if (wantedEmails.length > 0) {
      const waiting = Array.isArray(payload.waitingFor)
        ? payload.waitingFor
            .map((item) =>
              item && typeof item === "object" && "email" in item
                ? String((item as { email?: unknown }).email ?? "")
                    .trim()
                    .toLowerCase()
                : "",
            )
            .filter(Boolean)
        : [];
      const parts = await db
        .select()
        .from(sessionParticipants)
        .where(eq(sessionParticipants.sessionId, row.id));
      const emails = [
        ...new Set(
          [
            ...waiting,
            ...parts
              .filter((p) => p.userId !== opts.userId)
              .map((p) => p.email.toLowerCase()),
          ].filter(Boolean),
        ),
      ].sort();
      if (emails.join(",") === wantedEmails.join(",")) return row;
      continue;
    }

    if ((row.peerUserId ?? null) === (opts.peerUserId ?? null)) {
      return row;
    }
  }
  return null;
}

function toPublicSession(
  session: Session,
  peer: User | null,
  participants: PublicParticipant[] = [],
): PublicSession {
  return {
    id: session.id,
    intentType: session.intentType,
    status: session.status,
    initiatorUserId: session.initiatorUserId,
    peerUserId: session.peerUserId,
    linkId: session.linkId,
    payload: (session.payload as Record<string, unknown>) ?? {},
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    peer: peer
      ? { id: peer.id, email: peer.email, name: peer.name }
      : null,
    participants,
    multiParty: participants.length >= 3,
  };
}

function toPublicMessage(message: SessionMessage): PublicMessage {
  const body = (message.body as Record<string, unknown>) ?? {};
  return {
    id: message.id,
    sessionId: message.sessionId,
    senderUserId: message.senderUserId,
    actorKind: message.actorKind,
    kind: message.kind,
    body,
    createdAt: message.createdAt.toISOString(),
    plainEnglish: messageToPlainEnglish(message.kind, body),
  };
}
