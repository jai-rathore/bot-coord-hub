/**
 * Negotiation session state machine (adapted from bot-coord-sim).
 * Uses JSON-serializable Sets/Maps (arrays / plain objects).
 */

import type {
  ApplyResult,
  AvailOfferPayload,
  Envelope,
  ErrorPayload,
  IntentScheduleMeetingPayload,
  MeetingConfirmPayload,
  MessageType,
  NegotiationSession,
  Participant,
  Party,
  SessionState,
  Slot,
  SlotAcceptPayload,
  SlotDeclinePayload,
  SlotProposePayload,
} from "./types.js";
import { validateEnvelope } from "./validate.js";

const TERMINAL: SessionState[] = ["confirmed", "failed", "expired", "cancelled"];

function err(
  code: ErrorPayload["code"],
  message: string,
  retryable = false
): ErrorPayload {
  return { code, message, retryable };
}

function cloneSession(s: NegotiationSession): NegotiationSession {
  return structuredClone(s);
}

export function createSession(opts: {
  sessionId: string;
  linkId: string;
  initiator: Party;
  responder: Party;
  participants?: Participant[];
  createdAt?: string;
}): NegotiationSession {
  const now = opts.createdAt ?? new Date().toISOString();
  const participants: Participant[] =
    opts.participants ??
    [
      { ...opts.initiator, role: "organizer" },
      { ...opts.responder, role: "invitee" },
    ];
  const votes: NegotiationSession["votes"] = {};
  for (const p of participants) {
    if (p.role === "invitee") {
      votes[p.agentId] = { agentId: p.agentId, status: "pending" };
    }
  }
  return {
    sessionId: opts.sessionId,
    linkId: opts.linkId,
    state: "initiated",
    participants,
    initiator: opts.initiator,
    responder: opts.responder,
    availByParticipant: {},
    votes,
    seenMessageIds: [],
    resultsByMessageId: {},
    createdAt: now,
    updatedAt: now,
    audit: [],
  };
}

export function allInviteesAccepted(session: NegotiationSession): boolean {
  const invitees = session.participants.filter((p) => p.role === "invitee");
  if (invitees.length === 0) return false;
  return invitees.every((p) => session.votes[p.agentId]?.status === "accepted");
}

function nextState(
  current: SessionState,
  type: MessageType,
  payload: Record<string, unknown>
): { state: SessionState; sideEffects: string[]; error?: ErrorPayload } {
  if (type === "meeting.confirm" && current === "confirmed" && payload.replyTo) {
    return { state: "confirmed", sideEffects: ["merge_peer_external_refs"] };
  }

  if (TERMINAL.includes(current) && type !== "meeting.cancel") {
    return {
      state: current,
      sideEffects: [],
      error: err(
        "illegal_transition",
        `Cannot apply ${type} in terminal state ${current}`
      ),
    };
  }

  switch (type) {
    case "intent.schedule_meeting":
      if (current !== "initiated") {
        return {
          state: current,
          sideEffects: [],
          error: err(
            "illegal_transition",
            `intent.schedule_meeting only valid at session start (state=${current})`
          ),
        };
      }
      return { state: "initiated", sideEffects: ["store_intent"] };

    case "avail.request":
      if (
        current === "initiated" ||
        current === "awaiting_avail" ||
        current === "proposing"
      ) {
        return { state: "awaiting_avail", sideEffects: [] };
      }
      return {
        state: current,
        sideEffects: [],
        error: err("illegal_transition", `avail.request illegal in state ${current}`),
      };

    case "avail.offer": {
      if (current !== "awaiting_avail" && current !== "initiated") {
        return {
          state: current,
          sideEffects: [],
          error: err("illegal_transition", `avail.offer illegal in state ${current}`),
        };
      }
      const offer = payload as unknown as AvailOfferPayload;
      const slots = offer.slots ?? [];
      if (offer.format === "free_slots" && slots.length === 0) {
        return {
          state: "failed",
          sideEffects: ["store_peer_slots"],
          error: err("no_overlap", "No free slots of requested duration", false),
        };
      }
      return { state: "proposing", sideEffects: ["store_peer_slots"] };
    }

    case "slot.propose":
    case "slot.counter":
      if (current === "proposing" || current === "awaiting_avail") {
        return { state: "proposing", sideEffects: ["store_proposal"] };
      }
      return {
        state: current,
        sideEffects: [],
        error: err("illegal_transition", `${type} illegal in state ${current}`),
      };

    case "slot.accept":
      if (current !== "proposing") {
        return {
          state: current,
          sideEffects: [],
          error: err("illegal_transition", `slot.accept illegal in state ${current}`),
        };
      }
      return { state: "proposing", sideEffects: ["store_accepted_slot"] };

    case "slot.decline": {
      if (current !== "proposing") {
        return {
          state: current,
          sideEffects: [],
          error: err("illegal_transition", `slot.decline illegal in state ${current}`),
        };
      }
      const decline = payload as unknown as SlotDeclinePayload;
      return {
        state: "failed",
        sideEffects: ["store_decline_vote"],
        error: err(
          decline.reasonCode === "user_rejected" ? "user_rejected" : "conflict",
          decline.note ?? `Declined: ${decline.reasonCode ?? "other"}`,
          false
        ),
      };
    }

    case "meeting.confirm":
      if (current !== "proposing") {
        return {
          state: current,
          sideEffects: [],
          error: err(
            "illegal_transition",
            `meeting.confirm illegal in state ${current}`
          ),
        };
      }
      return {
        state: "confirmed",
        sideEffects: ["store_confirm_refs", "create_calendar_events"],
      };

    case "meeting.cancel":
      if (current === "cancelled") {
        return { state: "cancelled", sideEffects: [] };
      }
      if (
        current === "initiated" ||
        current === "awaiting_avail" ||
        current === "proposing" ||
        current === "confirmed"
      ) {
        return { state: "cancelled", sideEffects: ["cancel_calendar_events"] };
      }
      return {
        state: current,
        sideEffects: [],
        error: err("illegal_transition", `meeting.cancel illegal in state ${current}`),
      };

    case "error": {
      const code = (payload.code as string) ?? "internal";
      if (code === "no_overlap" || code === "user_rejected" || code === "conflict") {
        return { state: "failed", sideEffects: [] };
      }
      if (code === "timeout" || code === "expired") {
        return { state: "expired", sideEffects: [] };
      }
      if (code === "link_revoked") {
        return { state: "cancelled", sideEffects: [] };
      }
      if (
        code === "illegal_transition" ||
        code === "invalid_payload" ||
        code === "privacy_violation"
      ) {
        return { state: current, sideEffects: [] };
      }
      return { state: "failed", sideEffects: [] };
    }

    case "link.invite":
    case "link.accept":
    case "link.revoke":
      return {
        state: current,
        sideEffects: [],
        error: err(
          "illegal_transition",
          `${type} is a link lifecycle message, not a negotiation transition`
        ),
      };

    default:
      return {
        state: current,
        sideEffects: [],
        error: err("invalid_payload", `Unhandled type ${type}`),
      };
  }
}

function applySideEffects(
  session: NegotiationSession,
  effects: string[],
  envelope: Envelope
): void {
  const p = envelope.payload;
  for (const effect of effects) {
    switch (effect) {
      case "store_intent":
        session.intent = p as unknown as IntentScheduleMeetingPayload;
        break;
      case "store_peer_slots": {
        const offer = p as unknown as AvailOfferPayload;
        const slots = offer.slots ?? [];
        session.peerSlots = slots;
        session.availByParticipant[envelope.from.agentId] = slots;
        break;
      }
      case "store_proposal": {
        const prop = p as unknown as SlotProposePayload;
        session.proposalId = prop.proposalId;
        session.proposedSlots = prop.slots;
        // Reset invitee votes on new proposal
        for (const invitee of session.participants.filter((x) => x.role === "invitee")) {
          session.votes[invitee.agentId] = {
            agentId: invitee.agentId,
            status: "pending",
          };
        }
        break;
      }
      case "store_accepted_slot": {
        const acc = p as unknown as SlotAcceptPayload;
        session.acceptedSlot = acc.accepted as Slot;
        session.proposalId = acc.proposalId;
        session.votes[envelope.from.agentId] = {
          agentId: envelope.from.agentId,
          status: "accepted",
          accepted: acc.accepted as Slot,
          acceptedBy: acc.acceptedBy,
        };
        break;
      }
      case "store_confirm_refs":
      case "merge_peer_external_refs": {
        const conf = p as unknown as MeetingConfirmPayload;
        const prevIds = session.externalRefs?.participantEventIds ?? {};
        const nextIds = {
          ...prevIds,
          ...(conf.externalRefs?.participantEventIds ?? {}),
        };
        if (conf.externalRefs?.organizerEventId) {
          nextIds[envelope.from.agentId] = conf.externalRefs.organizerEventId;
        }
        if (conf.externalRefs?.peerEventId && effect === "merge_peer_external_refs") {
          nextIds[envelope.from.agentId] = conf.externalRefs.peerEventId;
        }
        session.externalRefs = {
          organizerEventId:
            conf.externalRefs?.organizerEventId ??
            session.externalRefs?.organizerEventId ??
            null,
          peerEventId:
            conf.externalRefs?.peerEventId ??
            session.externalRefs?.peerEventId ??
            null,
          participantEventIds: nextIds,
        };
        if (!session.acceptedSlot && conf.start && conf.end) {
          session.acceptedSlot = {
            start: conf.start,
            end: conf.end,
            timezone: conf.timezone,
          };
        }
        break;
      }
      case "store_decline_vote": {
        session.votes[envelope.from.agentId] = {
          agentId: envelope.from.agentId,
          status: "declined",
        };
        break;
      }
      default:
        break;
    }
  }
}

export interface ApplyOutput {
  session: NegotiationSession;
  result: ApplyResult;
}

export function applyMessage(
  session: NegotiationSession,
  envelope: Envelope
): ApplyOutput {
  const next = cloneSession(session);

  if (next.seenMessageIds.includes(envelope.id)) {
    const cached = next.resultsByMessageId[envelope.id];
    const result: ApplyResult = cached
      ? { ...cached, idempotentReplay: true }
      : {
          ok: true,
          state: next.state,
          sideEffects: [],
          idempotentReplay: true,
        };
    return { session: next, result };
  }

  const validation = validateEnvelope(envelope);
  if (!validation.ok) {
    const result: ApplyResult = {
      ok: false,
      state: next.state,
      sideEffects: [],
      error: validation.error,
    };
    next.seenMessageIds.push(envelope.id);
    next.resultsByMessageId[envelope.id] = result;
    next.updatedAt = envelope.ts;
    return { session: next, result };
  }

  if (
    envelope.type !== "link.invite" &&
    envelope.type !== "link.accept" &&
    envelope.type !== "link.revoke" &&
    envelope.correlationId !== next.sessionId
  ) {
    const result: ApplyResult = {
      ok: false,
      state: next.state,
      sideEffects: [],
      error: err(
        "invalid_payload",
        `correlationId ${envelope.correlationId} != session ${next.sessionId}`
      ),
    };
    next.seenMessageIds.push(envelope.id);
    next.resultsByMessageId[envelope.id] = result;
    return { session: next, result };
  }

  const fromState = next.state;

  if (
    envelope.type === "meeting.confirm" &&
    fromState === "proposing" &&
    !(envelope.payload as { replyTo?: string }).replyTo
  ) {
    const invitees = next.participants.filter((p) => p.role === "invitee");
    const missing = invitees.filter(
      (p) => next.votes[p.agentId]?.status !== "accepted"
    );
    if (missing.length > 0) {
      const result: ApplyResult = {
        ok: false,
        state: fromState,
        sideEffects: [],
        error: err(
          "illegal_transition",
          "meeting.confirm blocked: awaiting accepts from " +
            missing.map((m) => m.agentId).join(", ")
        ),
      };
      next.seenMessageIds.push(envelope.id);
      next.resultsByMessageId[envelope.id] = result;
      next.audit.push({
        ts: envelope.ts,
        type: envelope.type,
        messageId: envelope.id,
        fromState,
        toState: fromState,
        note: result.error?.message,
      });
      next.updatedAt = envelope.ts;
      return { session: next, result };
    }
  }

  const transition = nextState(
    fromState,
    envelope.type,
    envelope.payload as Record<string, unknown>
  );

  if (
    transition.error &&
    transition.state === fromState &&
    transition.sideEffects.length === 0
  ) {
    if (transition.error.code === "illegal_transition") {
      const result: ApplyResult = {
        ok: false,
        state: fromState,
        sideEffects: [],
        error: transition.error,
      };
      next.seenMessageIds.push(envelope.id);
      next.resultsByMessageId[envelope.id] = result;
      next.audit.push({
        ts: envelope.ts,
        type: envelope.type,
        messageId: envelope.id,
        fromState,
        toState: fromState,
        note: transition.error.message,
      });
      next.updatedAt = envelope.ts;
      return { session: next, result };
    }
  }

  applySideEffects(next, transition.sideEffects, envelope);
  next.state = transition.state;
  next.seenMessageIds.push(envelope.id);

  const result: ApplyResult = {
    ok: !transition.error,
    state: next.state,
    sideEffects: transition.sideEffects,
    error: transition.error,
  };

  if (
    transition.error &&
    (transition.error.code === "no_overlap" ||
      transition.error.code === "user_rejected" ||
      transition.error.code === "conflict")
  ) {
    result.ok = false;
  } else if (!transition.error) {
    result.ok = true;
  } else if (transition.state !== fromState) {
    result.ok = false;
  }

  next.resultsByMessageId[envelope.id] = {
    ok: result.ok,
    state: result.state,
    sideEffects: result.sideEffects,
    error: result.error,
  };

  next.audit.push({
    ts: envelope.ts,
    type: envelope.type,
    messageId: envelope.id,
    fromState,
    toState: next.state,
    note: transition.error?.message,
  });
  next.updatedAt = envelope.ts;

  return { session: next, result };
}
