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
      return text ?? "Shared available times (free/busy only).";
    case "slot.propose":
      return text ?? "Proposed meeting time(s).";
    case "slot.accept":
      return text ?? "Accepted a proposed time.";
    case "intent.schedule_meeting":
      return text ?? "Started a schedule_meeting intent.";
    default:
      return text ?? `Event: ${kind}`;
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
}): Promise<PublicSession> {
  const intentType = opts.intentType.trim();
  if (!intentType) {
    throw Object.assign(new Error("intentType is required"), { status: 400 });
  }

  const db = getDb();
  let peerUserId = opts.peerUserId ?? null;
  let linkId = opts.linkId ?? null;

  if (linkId) {
    const linkRows = await db
      .select()
      .from(links)
      .where(and(eq(links.id, linkId), eq(links.status, "active")))
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
  }

  if (peerUserId === opts.user.id) {
    throw Object.assign(new Error("peerUserId cannot be yourself"), {
      status: 400,
    });
  }

  const [created] = await db
    .insert(sessions)
    .values({
      intentType,
      initiatorUserId: opts.user.id,
      peerUserId,
      linkId,
      status: "open",
      payload: opts.payload ?? {},
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
}): Promise<PublicMessage> {
  const kind = opts.kind.trim();
  if (!kind) {
    throw Object.assign(new Error("kind is required"), { status: 400 });
  }

  const db = getDb();
  const body = opts.body ?? {};

  const [created] = await db
    .insert(sessionMessages)
    .values({
      sessionId: opts.session.id,
      senderUserId: opts.sender.id,
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
    kind: message.kind,
    body,
    createdAt: message.createdAt.toISOString(),
    plainEnglish: messageToPlainEnglish(message.kind, body),
  };
}
