/**
 * Hub business logic: links, sessions, inbox, agent shortcuts.
 */

import { applyMessage, createSession } from "./stateMachine.js";
import { loadStore, persistStore } from "./store.js";
import {
  ALL_SCOPES,
  PROTOCOL_VERSION,
  type Envelope,
  type HubData,
  type InboxMessage,
  type LinkRecord,
  type LinkScope,
  type MessageType,
  type NegotiationSession,
  type Party,
  type Slot,
  type UserRecord,
} from "./types.js";
import { inviteCode, msgId, nowIso, uid } from "./ids.js";
import { validateEnvelope } from "./validate.js";

export class HttpError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Auth = { userId: string; agentId: string };

function audit(
  data: HubData,
  entry: Omit<HubData["audit"][0], "id" | "ts"> & { ts?: string }
): void {
  data.audit.push({
    id: uid("aud"),
    ts: entry.ts ?? nowIso(),
    type: entry.type,
    actorUserId: entry.actorUserId,
    detail: entry.detail,
    linkId: entry.linkId,
    sessionId: entry.sessionId,
    meta: entry.meta,
  });
}

function findUserById(data: HubData, userId: string): UserRecord | undefined {
  return data.users.find((u) => u.userId === userId);
}

function findUserByEmail(data: HubData, email: string): UserRecord | undefined {
  const needle = email.trim().toLowerCase();
  return data.users.find((u) => u.email.toLowerCase() === needle);
}

function ensureUserForEmail(
  data: HubData,
  email: string,
  name?: string
): UserRecord {
  const existing = findUserByEmail(data, email);
  if (existing) return existing;
  const base =
    email.split("@")[0]?.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "peer";
  const user: UserRecord = {
    userId: `usr_${base}`,
    agentId: `agt_${base}_cos`,
    displayName: name ?? base,
    email,
  };
  if (data.users.some((u) => u.userId === user.userId)) {
    user.userId = uid("usr");
    user.agentId = uid("agt");
  }
  data.users.push(user);
  return user;
}

function pushInbox(
  data: HubData,
  agentId: string,
  envelope: Envelope,
  kind: string
): InboxMessage {
  const msg: InboxMessage = {
    messageId: envelope.id,
    agentId,
    envelope,
    createdAt: envelope.ts,
    acked: false,
    kind,
  };
  data.inbox.push(msg);
  return msg;
}

function publicLink(link: LinkRecord, baseUrl: string) {
  return {
    linkId: link.linkId,
    status: link.status,
    scopes: link.scopes,
    parties: link.parties,
    inviterUserId: link.inviterUserId,
    inviteeUserId: link.inviteeUserId,
    inviteeEmail: link.inviteeEmail,
    inviteeName: link.inviteeName,
    inviteCode: link.inviteCode,
    inviteUrl: link.inviteCode
      ? `${baseUrl}/invite/${link.inviteCode}`
      : undefined,
    createdAt: link.createdAt,
    acceptedAt: link.acceptedAt,
    revokedAt: link.revokedAt,
    expiresAt: link.expiresAt,
  };
}

function publicSession(session: NegotiationSession) {
  return {
    sessionId: session.sessionId,
    linkId: session.linkId,
    state: session.state,
    participants: session.participants,
    initiator: session.initiator,
    responder: session.responder,
    intent: session.intent,
    proposalId: session.proposalId,
    proposedSlots: session.proposedSlots,
    acceptedSlot: session.acceptedSlot,
    votes: session.votes,
    availByParticipant: session.availByParticipant,
    externalRefs: session.externalRefs,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    audit: session.audit,
  };
}

function saveSession(data: HubData, session: NegotiationSession): void {
  const idx = data.sessions.findIndex((s) => s.sessionId === session.sessionId);
  if (idx >= 0) data.sessions[idx] = session;
  else data.sessions.push(session);
}

function getActiveLinkBetween(
  data: HubData,
  a: string,
  b: string
): LinkRecord | undefined {
  return data.links.find(
    (l) =>
      l.status === "active" &&
      ((l.inviterUserId === a && l.inviteeUserId === b) ||
        (l.inviterUserId === b && l.inviteeUserId === a))
  );
}

function deliverToPeer(
  data: HubData,
  envelope: Envelope,
  kind: string
): void {
  pushInbox(data, envelope.to.agentId, envelope, kind);
}

export function getHealth() {
  const data = loadStore();
  return {
    ok: true,
    service: "bot-coord-hub",
    version: "0.4.0",
    protocol: PROTOCOL_VERSION,
    users: data.users.length,
    links: data.links.length,
    sessions: data.sessions.length,
    pendingInbox: data.inbox.filter((m) => !m.acked).length,
  };
}

export function createInvite(
  auth: Auth,
  body: {
    fromUserId?: string;
    fromAgentId?: string;
    toEmail: string;
    toName?: string;
    scopes?: string[];
  },
  baseUrl: string
) {
  if (!body.toEmail) {
    throw new HttpError(400, "invalid_payload", "toEmail is required");
  }
  const fromUserId = body.fromUserId ?? auth.userId;
  const fromAgentId = body.fromAgentId ?? auth.agentId;
  if (fromUserId !== auth.userId) {
    throw new HttpError(
      403,
      "unauthorized",
      "fromUserId must match API key owner"
    );
  }

  const data = loadStore();
  const inviter = findUserById(data, fromUserId);
  if (!inviter) {
    throw new HttpError(404, "not_found", `Unknown user ${fromUserId}`);
  }
  const invitee = ensureUserForEmail(data, body.toEmail, body.toName);
  if (invitee.userId === inviter.userId) {
    throw new HttpError(400, "invalid_payload", "Cannot invite yourself");
  }

  const active = getActiveLinkBetween(data, inviter.userId, invitee.userId);
  if (active) {
    throw new HttpError(409, "conflict", "Active link already exists", {
      linkId: active.linkId,
    });
  }

  const scopes = (body.scopes?.length ? body.scopes : ALL_SCOPES) as LinkScope[];
  const code = inviteCode();
  const now = nowIso();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const link: LinkRecord = {
    linkId: uid("lnk"),
    parties: [
      { userId: inviter.userId, agentId: fromAgentId },
      { userId: invitee.userId, agentId: invitee.agentId },
    ],
    status: "pending",
    scopes,
    createdAt: now,
    inviteCode: code,
    expiresAt: expires,
    inviterUserId: inviter.userId,
    inviteeUserId: invitee.userId,
    inviteeEmail: invitee.email,
    inviteeName: body.toName ?? invitee.displayName,
  };
  data.links.push(link);

  const envelope: Envelope = {
    v: PROTOCOL_VERSION,
    type: "link.invite",
    id: msgId(),
    ts: now,
    from: { userId: inviter.userId, agentId: fromAgentId },
    to: { userId: invitee.userId, agentId: invitee.agentId },
    linkId: link.linkId,
    correlationId: link.linkId,
    payload: {
      inviteCode: code,
      inviterDisplayName: inviter.displayName,
      expiresAt: expires,
      scopesRequested: scopes,
    },
  };
  pushInbox(data, invitee.agentId, envelope, "link.invite");
  audit(data, {
    type: "link.invite",
    actorUserId: inviter.userId,
    detail: `${inviter.displayName} invited ${invitee.email}`,
    linkId: link.linkId,
  });
  persistStore(data);

  return {
    ...publicLink(link, baseUrl),
    status: "pending" as const,
  };
}

export function acceptInvite(
  auth: Auth,
  body: { inviteCode: string; userId?: string; agentId?: string },
  baseUrl: string
) {
  if (!body.inviteCode) {
    throw new HttpError(400, "invalid_payload", "inviteCode is required");
  }
  const userId = body.userId ?? auth.userId;
  const agentId = body.agentId ?? auth.agentId;
  if (userId !== auth.userId) {
    throw new HttpError(403, "unauthorized", "userId must match API key owner");
  }

  const data = loadStore();
  const link = data.links.find(
    (l) => l.inviteCode === body.inviteCode && l.status === "pending"
  );
  if (!link) {
    throw new HttpError(404, "not_found", "Invite not found or not pending");
  }
  if (link.expiresAt && Date.parse(link.expiresAt) < Date.now()) {
    throw new HttpError(410, "expired", "Invite has expired");
  }
  if (link.inviteeUserId !== userId) {
    // Allow accept if email matches seeded user accepting into their account
    const user = findUserById(data, userId);
    if (!user || user.email.toLowerCase() !== link.inviteeEmail.toLowerCase()) {
      throw new HttpError(
        403,
        "unauthorized",
        "This invite is addressed to a different user"
      );
    }
  }

  const now = nowIso();
  link.status = "active";
  link.acceptedAt = now;
  // Bind accepting agent
  link.parties[1] = { userId, agentId };
  link.inviteeUserId = userId;

  const inviter = findUserById(data, link.inviterUserId)!;
  const envelope: Envelope = {
    v: PROTOCOL_VERSION,
    type: "link.accept",
    id: msgId(),
    ts: now,
    from: { userId, agentId },
    to: link.parties[0],
    linkId: link.linkId,
    correlationId: link.linkId,
    payload: {
      scopesGranted: link.scopes,
      acceptedAt: now,
    },
  };
  pushInbox(data, link.parties[0].agentId, envelope, "link.accept");
  audit(data, {
    type: "link.accept",
    actorUserId: userId,
    detail: `${userId} accepted link from ${inviter.displayName}`,
    linkId: link.linkId,
  });
  persistStore(data);
  return publicLink(link, baseUrl);
}

export function revokeLink(
  auth: Auth,
  body: { linkId: string; userId?: string }
) {
  if (!body.linkId) {
    throw new HttpError(400, "invalid_payload", "linkId is required");
  }
  const userId = body.userId ?? auth.userId;
  if (userId !== auth.userId) {
    throw new HttpError(403, "unauthorized", "userId must match API key owner");
  }

  const data = loadStore();
  const link = data.links.find((l) => l.linkId === body.linkId);
  if (!link) throw new HttpError(404, "not_found", "Link not found");
  if (link.inviterUserId !== userId && link.inviteeUserId !== userId) {
    throw new HttpError(403, "unauthorized", "Not a party on this link");
  }
  if (link.status === "revoked") {
    return { linkId: link.linkId, status: link.status };
  }

  const now = nowIso();
  link.status = "revoked";
  link.revokedAt = now;
  link.revokedBy = userId;

  // Cancel in-flight sessions on this link
  for (const s of data.sessions) {
    if (
      s.linkId === link.linkId &&
      !["confirmed", "failed", "expired", "cancelled"].includes(s.state)
    ) {
      const fromState = s.state;
      s.state = "cancelled";
      s.updatedAt = now;
      s.audit.push({
        ts: now,
        type: "error",
        messageId: msgId(),
        fromState,
        toState: "cancelled",
        note: "link_revoked",
      });
    }
  }

  const other =
    link.inviterUserId === userId ? link.parties[1] : link.parties[0];
  const self = link.inviterUserId === userId ? link.parties[0] : link.parties[1];
  const envelope: Envelope = {
    v: PROTOCOL_VERSION,
    type: "link.revoke",
    id: msgId(),
    ts: now,
    from: { userId: self.userId, agentId: self.agentId },
    to: { userId: other.userId, agentId: other.agentId },
    linkId: link.linkId,
    correlationId: link.linkId,
    payload: { reason: "user_revoked", revokedBy: userId },
  };
  pushInbox(data, other.agentId, envelope, "link.revoke");
  audit(data, {
    type: "link.revoke",
    actorUserId: userId,
    detail: `${userId} revoked ${link.linkId}`,
    linkId: link.linkId,
  });
  persistStore(data);
  return { linkId: link.linkId, status: "revoked" as const, revokedAt: now };
}

export function listLinks(auth: Auth, userId?: string, baseUrl = "") {
  const uidFilter = userId ?? auth.userId;
  if (uidFilter !== auth.userId) {
    throw new HttpError(403, "unauthorized", "Can only list own links");
  }
  const data = loadStore();
  return data.links
    .filter(
      (l) => l.inviterUserId === uidFilter || l.inviteeUserId === uidFilter
    )
    .map((l) => publicLink(l, baseUrl));
}

function buildEnvelope(opts: {
  type: MessageType;
  from: Party;
  to: Party;
  linkId: string;
  correlationId: string;
  payload: Record<string, unknown>;
  id?: string;
  ts?: string;
}): Envelope {
  return {
    v: PROTOCOL_VERSION,
    type: opts.type,
    id: opts.id ?? msgId(),
    ts: opts.ts ?? nowIso(),
    from: opts.from,
    to: opts.to,
    linkId: opts.linkId,
    correlationId: opts.correlationId,
    payload: opts.payload,
  };
}

export function startSession(
  auth: Auth,
  body: {
    peerUserId?: string;
    peerEmail?: string;
    participants?: Array<{ userId: string; agentId: string; role: string }>;
    durationMinutes: number;
    windowStart: string;
    windowEnd: string;
    timezone: string;
    title: string;
    notes?: string;
    locationPreference?: string;
  }
) {
  if (
    !body.durationMinutes ||
    !body.windowStart ||
    !body.windowEnd ||
    !body.timezone ||
    !body.title
  ) {
    throw new HttpError(
      400,
      "invalid_payload",
      "durationMinutes, windowStart, windowEnd, timezone, title required"
    );
  }

  const data = loadStore();
  const organizer = findUserById(data, auth.userId);
  if (!organizer) throw new HttpError(404, "not_found", "Auth user missing");

  let peer: UserRecord | undefined;
  if (body.peerUserId) peer = findUserById(data, body.peerUserId);
  else if (body.peerEmail) peer = findUserByEmail(data, body.peerEmail);
  else if (body.participants?.length) {
    const invitee = body.participants.find((p) => p.role === "invitee");
    if (invitee) peer = findUserById(data, invitee.userId);
  }
  if (!peer) {
    throw new HttpError(
      400,
      "invalid_payload",
      "peerEmail, peerUserId, or participants with invitee required"
    );
  }

  const link = getActiveLinkBetween(data, organizer.userId, peer.userId);
  if (!link) {
    throw new HttpError(
      409,
      "link_pending",
      `No active link with ${peer.email}. Create and accept an invite first.`
    );
  }

  const sessionId = uid("neg");
  const initiator: Party = { userId: organizer.userId, agentId: auth.agentId };
  const responder: Party = { userId: peer.userId, agentId: peer.agentId };
  let session = createSession({
    sessionId,
    linkId: link.linkId,
    initiator,
    responder,
  });

  const intentPayload = {
    durationMinutes: body.durationMinutes,
    windowStart: body.windowStart,
    windowEnd: body.windowEnd,
    timezone: body.timezone,
    title: body.title,
    notes: body.notes,
    locationPreference: body.locationPreference,
    participants: session.participants,
    attendees: [
      { email: organizer.email, role: "organizer" },
      { email: peer.email, role: "attendee" },
    ],
  };

  const intentEnv = buildEnvelope({
    type: "intent.schedule_meeting",
    from: initiator,
    to: responder,
    linkId: link.linkId,
    correlationId: sessionId,
    payload: intentPayload,
  });
  let applied = applyMessage(session, intentEnv);
  session = applied.session;
  if (!applied.result.ok) {
    throw new HttpError(
      400,
      applied.result.error?.code ?? "invalid_payload",
      applied.result.error?.message ?? "Failed to start session"
    );
  }

  // Move to awaiting_avail with avail.request
  const availEnv = buildEnvelope({
    type: "avail.request",
    from: initiator,
    to: responder,
    linkId: link.linkId,
    correlationId: sessionId,
    payload: {
      durationMinutes: body.durationMinutes,
      windowStart: body.windowStart,
      windowEnd: body.windowEnd,
      timezone: body.timezone,
      format: "free_slots",
      workingHoursOnly: true,
      replyTo: intentEnv.id,
    },
  });
  applied = applyMessage(session, availEnv);
  session = applied.session;

  deliverToPeer(data, intentEnv, "intent.schedule_meeting");
  deliverToPeer(data, availEnv, "avail.request");
  saveSession(data, session);
  audit(data, {
    type: "session.start",
    actorUserId: auth.userId,
    detail: `Started schedule_meeting with ${peer.displayName}: ${body.title}`,
    linkId: link.linkId,
    sessionId,
  });
  persistStore(data);

  return { sessionId, state: session.state, session: publicSession(session) };
}

export function postSessionMessage(
  auth: Auth,
  sessionId: string,
  body: {
    /** Full protocol envelope (optional if action provided) */
    envelope?: Envelope;
    /** Simplified action */
    action?:
      | "avail.offer"
      | "slot.propose"
      | "slot.accept"
      | "slot.decline"
      | "slot.counter"
      | "meeting.confirm"
      | "meeting.cancel";
    payload?: Record<string, unknown>;
  }
) {
  const data = loadStore();
  const idx = data.sessions.findIndex((s) => s.sessionId === sessionId);
  if (idx < 0) throw new HttpError(404, "not_found", "Session not found");
  let session = data.sessions[idx]!;

  const isParty = session.participants.some((p) => p.userId === auth.userId);
  if (!isParty) {
    throw new HttpError(403, "unauthorized", "Not a participant");
  }

  const link = data.links.find((l) => l.linkId === session.linkId);
  if (!link || link.status !== "active") {
    throw new HttpError(409, "link_revoked", "Link is not active");
  }

  const self = session.participants.find((p) => p.userId === auth.userId)!;
  const peer =
    session.participants.find((p) => p.userId !== auth.userId) ??
    session.responder;

  let envelope: Envelope;
  if (body.envelope) {
    envelope = body.envelope;
    if (envelope.from.userId !== auth.userId) {
      throw new HttpError(403, "unauthorized", "envelope.from must be you");
    }
  } else if (body.action) {
    envelope = buildEnvelope({
      type: body.action,
      from: { userId: self.userId, agentId: auth.agentId },
      to: { userId: peer.userId, agentId: peer.agentId },
      linkId: session.linkId,
      correlationId: sessionId,
      payload: body.payload ?? {},
    });
  } else {
    throw new HttpError(
      400,
      "invalid_payload",
      "Provide envelope or action+payload"
    );
  }

  const validation = validateEnvelope(envelope);
  if (!validation.ok) {
    throw new HttpError(
      400,
      validation.error?.code ?? "invalid_payload",
      validation.error?.message ?? "Invalid envelope"
    );
  }

  const applied = applyMessage(session, envelope);
  session = applied.session;
  saveSession(data, session);

  if (applied.result.ok || applied.result.state !== session.state) {
    deliverToPeer(data, envelope, envelope.type);
  }

  audit(data, {
    type: `session.${envelope.type}`,
    actorUserId: auth.userId,
    detail: `${envelope.type} on ${sessionId} → ${applied.result.state}`,
    linkId: session.linkId,
    sessionId,
  });
  persistStore(data);

  return {
    ok: applied.result.ok,
    state: applied.result.state,
    result: applied.result,
    session: publicSession(session),
  };
}

export function getSession(auth: Auth, sessionId: string) {
  const data = loadStore();
  const session = data.sessions.find((s) => s.sessionId === sessionId);
  if (!session) throw new HttpError(404, "not_found", "Session not found");
  const isParty = session.participants.some((p) => p.userId === auth.userId);
  if (!isParty) {
    throw new HttpError(403, "unauthorized", "Not a participant");
  }
  return publicSession(session);
}

export function getInbox(auth: Auth, agentId?: string) {
  const aid = agentId ?? auth.agentId;
  if (aid !== auth.agentId) {
    throw new HttpError(403, "unauthorized", "Can only read own agent inbox");
  }
  const data = loadStore();
  return data.inbox
    .filter((m) => m.agentId === aid && !m.acked)
    .map((m) => ({
      messageId: m.messageId,
      kind: m.kind,
      createdAt: m.createdAt,
      envelope: m.envelope,
    }));
}

export function ackInbox(auth: Auth, messageId: string) {
  const data = loadStore();
  const msg = data.inbox.find((m) => m.messageId === messageId);
  if (!msg) throw new HttpError(404, "not_found", "Message not found");
  if (msg.agentId !== auth.agentId) {
    throw new HttpError(403, "unauthorized", "Not your inbox message");
  }
  msg.acked = true;
  msg.ackedAt = nowIso();
  persistStore(data);
  return { messageId, acked: true, ackedAt: msg.ackedAt };
}

/** Agent shortcut: schedule with peer by email. */
export function agentSchedule(
  auth: Auth,
  body: {
    peerEmail: string;
    durationMinutes: number;
    windowStart: string;
    windowEnd: string;
    timezone: string;
    title: string;
    notes?: string;
  }
) {
  return startSession(auth, {
    peerEmail: body.peerEmail,
    durationMinutes: body.durationMinutes,
    windowStart: body.windowStart,
    windowEnd: body.windowEnd,
    timezone: body.timezone,
    title: body.title,
    notes: body.notes,
  });
}

/** Agent shortcut: respond to a proposal. */
export function agentRespond(
  auth: Auth,
  body: {
    sessionId: string;
    action: "accept" | "decline" | "counter";
    slot?: Slot;
    proposalId?: string;
    note?: string;
    counters?: Slot[];
  }
) {
  const data = loadStore();
  const session = data.sessions.find((s) => s.sessionId === body.sessionId);
  if (!session) throw new HttpError(404, "not_found", "Session not found");

  const proposalId = body.proposalId ?? session.proposalId;
  if (!proposalId && body.action !== "counter") {
    throw new HttpError(400, "invalid_payload", "No proposalId on session");
  }

  if (body.action === "accept") {
    const slot =
      body.slot ??
      session.proposedSlots?.[0] ??
      session.acceptedSlot;
    if (!slot) {
      throw new HttpError(400, "invalid_payload", "slot required to accept");
    }
    const result = postSessionMessage(auth, body.sessionId, {
      action: "slot.accept",
      payload: {
        proposalId,
        accepted: slot,
        acceptedBy: "user",
      },
    });

    // If all accepted and caller is organizer... actually invitee accepts.
    // Organizer confirms separately via meeting.confirm — but for dogfood UX,
    // when invitee accepts in 1:1, leave session in proposing; organizer's
    // pending will show they can confirm. Optionally auto-confirm if policy —
    // skill handles human confirm.
    return result;
  }

  if (body.action === "decline") {
    return postSessionMessage(auth, body.sessionId, {
      action: "slot.decline",
      payload: {
        proposalId,
        reasonCode: "user_rejected",
        note: body.note ?? "Declined by user",
      },
    });
  }

  // counter
  const slots = body.counters ?? (body.slot ? [body.slot] : undefined);
  if (!slots?.length) {
    throw new HttpError(400, "invalid_payload", "slot or counters required");
  }
  return postSessionMessage(auth, body.sessionId, {
    action: "slot.counter",
    payload: {
      proposalId: uid("prop"),
      counters: proposalId,
      slots: slots.map((s, i) => ({ ...s, rank: s.rank ?? i + 1 })),
      title: session.intent?.title ?? "Meeting",
      notes: session.intent?.notes,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
  });
}

/** What needs this agent's attention (pending inbox + actionable sessions). */
export function agentPending(auth: Auth) {
  const data = loadStore();
  const inbox = data.inbox
    .filter((m) => m.agentId === auth.agentId && !m.acked)
    .map((m) => ({
      messageId: m.messageId,
      kind: m.kind,
      createdAt: m.createdAt,
      sessionId: m.envelope.correlationId,
      type: m.envelope.type,
      from: m.envelope.from,
      summary: summarizeEnvelope(m.envelope, data),
    }));

  const sessions = data.sessions
    .filter((s) => s.participants.some((p) => p.agentId === auth.agentId))
    .filter((s) => !["confirmed", "failed", "expired", "cancelled"].includes(s.state))
    .map((s) => {
      const role = s.participants.find((p) => p.agentId === auth.agentId)?.role;
      let needs: string | null = null;
      if (s.state === "awaiting_avail" && role === "invitee") {
        needs = "offer_availability";
      } else if (
        s.state === "proposing" &&
        role === "invitee" &&
        s.votes[auth.agentId]?.status === "pending" &&
        s.proposalId
      ) {
        needs = "vote_on_proposal";
      } else if (
        s.state === "proposing" &&
        role === "organizer" &&
        Object.values(s.votes).every((v) => v.status === "accepted")
      ) {
        needs = "confirm_meeting";
      } else if (s.state === "proposing" && role === "organizer" && !s.proposalId) {
        needs = "propose_slot";
      }
      return {
        sessionId: s.sessionId,
        state: s.state,
        role,
        needs,
        title: s.intent?.title,
        proposalId: s.proposalId,
        proposedSlots: s.proposedSlots,
        votes: s.votes,
      };
    })
    .filter((s) => s.needs);

  return { inbox, sessions, agentId: auth.agentId, userId: auth.userId };
}

function summarizeEnvelope(env: Envelope, data: HubData): string {
  const fromUser = findUserById(data, env.from.userId);
  const name = fromUser?.displayName ?? env.from.userId;
  switch (env.type) {
    case "link.invite":
      return `${name} invited you to link agents`;
    case "link.accept":
      return `${name} accepted your link invite`;
    case "intent.schedule_meeting": {
      const title = (env.payload as { title?: string }).title ?? "a meeting";
      return `${name} wants to schedule: ${title}`;
    }
    case "avail.request":
      return `${name} requested your free/busy slots`;
    case "slot.propose":
      return `${name} proposed meeting time(s) — please accept, decline, or counter`;
    case "slot.accept":
      return `${name} accepted a proposed slot`;
    case "slot.decline":
      return `${name} declined a proposed slot`;
    case "meeting.confirm":
      return `${name} confirmed the meeting`;
    default:
      return `${name}: ${env.type}`;
  }
}

/** Helper used by dogfood / tests: propose top slot after receiving avail. */
export function agentPropose(
  auth: Auth,
  body: { sessionId: string; slots: Slot[] }
) {
  const data = loadStore();
  const session = data.sessions.find((s) => s.sessionId === body.sessionId);
  if (!session) throw new HttpError(404, "not_found", "Session not found");
  if (!body.slots?.length) {
    throw new HttpError(400, "invalid_payload", "slots required");
  }
  return postSessionMessage(auth, body.sessionId, {
    action: "slot.propose",
    payload: {
      proposalId: uid("prop"),
      slots: body.slots.map((s, i) => ({ ...s, rank: s.rank ?? i + 1 })),
      title: session.intent?.title ?? "Meeting",
      notes: session.intent?.notes,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
  });
}

export function agentConfirm(
  auth: Auth,
  body: {
    sessionId: string;
    slot?: Slot;
    externalRef?: string;
  }
) {
  const data = loadStore();
  const session = data.sessions.find((s) => s.sessionId === body.sessionId);
  if (!session) throw new HttpError(404, "not_found", "Session not found");
  const slot = body.slot ?? session.acceptedSlot ?? session.proposedSlots?.[0];
  if (!slot) {
    throw new HttpError(400, "invalid_payload", "No accepted/proposed slot");
  }
  const organizer = findUserById(data, session.initiator.userId);
  const peer = findUserById(data, session.responder.userId);
  return postSessionMessage(auth, body.sessionId, {
    action: "meeting.confirm",
    payload: {
      proposalId: session.proposalId ?? uid("prop"),
      title: session.intent?.title ?? "Meeting",
      notes: session.intent?.notes,
      start: slot.start,
      end: slot.end,
      timezone: slot.timezone ?? session.intent?.timezone ?? "UTC",
      location: { type: "google_meet" },
      attendees: [
        { email: organizer?.email, userId: session.initiator.userId },
        { email: peer?.email, userId: session.responder.userId },
      ],
      externalRefs: {
        organizerEventId: body.externalRef ?? `local_${uid("evt")}`,
        peerEventId: null,
        participantEventIds: {
          [session.initiator.userId]: body.externalRef ?? `local_${uid("evt")}`,
        },
      },
      confirmedAt: nowIso(),
    },
  });
}

