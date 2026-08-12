/**
 * Bot Coord Hub — protocol types (adapted from bot-coord-sim).
 */

export const PROTOCOL_VERSION = 1 as const;

export type MessageType =
  | "link.invite"
  | "link.accept"
  | "link.revoke"
  | "intent.schedule_meeting"
  | "avail.request"
  | "avail.offer"
  | "slot.propose"
  | "slot.accept"
  | "slot.decline"
  | "slot.counter"
  | "meeting.confirm"
  | "meeting.cancel"
  | "error";

export type SessionState =
  | "initiated"
  | "awaiting_avail"
  | "proposing"
  | "confirmed"
  | "failed"
  | "expired"
  | "cancelled";

export type ErrorCode =
  | "unauthorized"
  | "link_revoked"
  | "link_pending"
  | "no_overlap"
  | "user_rejected"
  | "timeout"
  | "expired"
  | "conflict"
  | "invalid_payload"
  | "unsupported_version"
  | "rate_limited"
  | "internal"
  | "illegal_transition"
  | "privacy_violation";

export type LinkStatus = "pending" | "active" | "revoked";
export type LinkScope = "schedule_meeting" | "avail.read_freebusy";
export type ParticipantRole = "organizer" | "invitee";
export type VoteStatus = "pending" | "accepted" | "declined" | "countered";

export interface Party {
  userId: string;
  agentId: string;
}

export interface Participant extends Party {
  role: ParticipantRole;
}

export interface Slot {
  start: string;
  end: string;
  timezone?: string;
  rank?: number;
}

export interface Envelope<T = Record<string, unknown>> {
  v: number;
  type: MessageType;
  id: string;
  ts: string;
  from: Party;
  to: Party;
  linkId: string;
  correlationId: string;
  payload: T;
}

export interface IntentScheduleMeetingPayload {
  durationMinutes: number;
  windowStart: string;
  windowEnd: string;
  timezone: string;
  title: string;
  notes?: string;
  attendees?: Array<{ email: string; role?: string }>;
  locationPreference?: "google_meet" | "zoom" | "phone" | "in_person" | "none";
  earliestNoticeHours?: number;
  maxProposals?: number;
  participants?: Participant[];
}

export interface AvailOfferPayload {
  format: "free_slots" | "opaque_busy";
  timezone: string;
  durationMinutes: number;
  slots: Slot[] | null;
  opaqueBusy: Array<{ start: string; end: string }> | null;
  expiresAt: string;
  replyTo?: string;
}

export interface SlotProposePayload {
  proposalId: string;
  slots: Slot[];
  title: string;
  notes?: string;
  locationPreference?: string;
  expiresAt: string;
  counters?: string;
}

export interface SlotAcceptPayload {
  proposalId: string;
  accepted: Slot;
  acceptedBy: "user" | "policy";
}

export interface SlotDeclinePayload {
  proposalId: string;
  reasonCode?: "conflict" | "user_rejected" | "other";
  note?: string;
}

export interface MeetingConfirmPayload {
  proposalId: string;
  title: string;
  notes?: string;
  start: string;
  end: string;
  timezone: string;
  location?: { type: string; url?: string };
  attendees?: Array<{ email: string; userId?: string }>;
  externalRefs: {
    organizerEventId: string | null;
    peerEventId: string | null;
    participantEventIds?: Record<string, string>;
  };
  confirmedAt: string;
  replyTo?: string;
}

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  replyTo?: string;
  details?: Record<string, unknown>;
}

export interface ApplyResult {
  ok: boolean;
  state: SessionState;
  sideEffects: string[];
  error?: ErrorPayload;
  idempotentReplay?: boolean;
}

export interface ParticipantVote {
  agentId: string;
  status: VoteStatus;
  accepted?: Slot;
  acceptedBy?: "user" | "policy";
}

export interface SessionAuditEntry {
  ts: string;
  type: MessageType;
  messageId: string;
  fromState: SessionState;
  toState: SessionState;
  note?: string;
}

/** Persistable session (Sets/Maps serialized as arrays/objects). */
export interface NegotiationSession {
  sessionId: string;
  linkId: string;
  state: SessionState;
  participants: Participant[];
  initiator: Party;
  responder: Party;
  intent?: IntentScheduleMeetingPayload;
  availByParticipant: Record<string, Slot[]>;
  peerSlots?: Slot[];
  proposalId?: string;
  proposedSlots?: Slot[];
  acceptedSlot?: Slot;
  votes: Record<string, ParticipantVote>;
  externalRefs?: {
    organizerEventId: string | null;
    peerEventId: string | null;
    participantEventIds?: Record<string, string>;
  };
  seenMessageIds: string[];
  resultsByMessageId: Record<string, ApplyResult>;
  createdAt: string;
  updatedAt: string;
  audit: SessionAuditEntry[];
}

export interface UserRecord {
  userId: string;
  agentId: string;
  displayName: string;
  email: string;
  handle?: string;
  timezone?: string;
}

export interface ApiKeyRecord {
  key: string;
  userId: string;
  agentId: string;
  label: string;
}

export interface LinkRecord {
  linkId: string;
  parties: [Party, Party];
  status: LinkStatus;
  scopes: LinkScope[];
  createdAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  revokedBy?: string;
  inviteCode?: string;
  expiresAt?: string;
  inviterUserId: string;
  inviteeUserId: string;
  inviteeEmail: string;
  inviteeName?: string;
}

export interface InboxMessage {
  messageId: string;
  agentId: string;
  envelope: Envelope;
  createdAt: string;
  acked: boolean;
  ackedAt?: string;
  /** Human-readable reason this is in the inbox (for agent skill). */
  kind: string;
}

export interface HubAuditEntry {
  id: string;
  ts: string;
  type: string;
  actorUserId?: string;
  detail: string;
  linkId?: string;
  sessionId?: string;
  meta?: Record<string, unknown>;
}

export interface HubData {
  version: 1;
  users: UserRecord[];
  apiKeys: ApiKeyRecord[];
  links: LinkRecord[];
  sessions: NegotiationSession[];
  inbox: InboxMessage[];
  audit: HubAuditEntry[];
}

export const ALL_SCOPES: LinkScope[] = [
  "schedule_meeting",
  "avail.read_freebusy",
];

export const IDS = {
  JAI_USER: "usr_jai",
  JAI_AGENT: "agt_jai_cos",
  RISHAV_USER: "usr_rishav",
  RISHAV_AGENT: "agt_rishav_cos",
  JAI_KEY: "bc_jai_dev_key",
  RISHAV_KEY: "bc_rishav_dev_key",
} as const;
