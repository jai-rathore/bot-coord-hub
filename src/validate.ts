/**
 * Envelope validation + privacy guards (adapted from bot-coord-sim).
 */

import {
  PROTOCOL_VERSION,
  type Envelope,
  type ErrorPayload,
  type MessageType,
} from "./types.js";

const MESSAGE_TYPES: MessageType[] = [
  "link.invite",
  "link.accept",
  "link.revoke",
  "intent.schedule_meeting",
  "avail.request",
  "avail.offer",
  "slot.propose",
  "slot.accept",
  "slot.decline",
  "slot.counter",
  "meeting.confirm",
  "meeting.cancel",
  "error",
];

const PRIVACY_FORBIDDEN_KEYS = [
  "eventTitles",
  "eventTitle",
  "peerEventTitles",
  "calendarTitles",
  "attendeeListFromPeer",
  "peerAttendees",
  "oauthToken",
  "refreshToken",
  "accessToken",
];

export interface ValidationResult {
  ok: boolean;
  error?: ErrorPayload;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasParty(v: unknown): boolean {
  if (!isObject(v)) return false;
  return typeof v.userId === "string" && typeof v.agentId === "string";
}

export function findPrivacyViolations(value: unknown, path = ""): string[] {
  const hits: string[] = [];
  if (!isObject(value) && !Array.isArray(value)) return hits;

  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      hits.push(...findPrivacyViolations(item, `${path}[${i}]`));
    });
    return hits;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (PRIVACY_FORBIDDEN_KEYS.includes(key)) {
      hits.push(childPath);
    }
    if (
      (key === "titles" || key === "eventNames") &&
      Array.isArray(child) &&
      child.every((x) => typeof x === "string")
    ) {
      hits.push(childPath);
    }
    hits.push(...findPrivacyViolations(child, childPath));
  }
  return hits;
}

function err(
  code: ErrorPayload["code"],
  message: string,
  retryable = false
): ErrorPayload {
  return { code, message, retryable };
}

export function validateEnvelope(envelope: unknown): ValidationResult {
  if (!isObject(envelope)) {
    return { ok: false, error: err("invalid_payload", "Envelope must be an object") };
  }
  if (envelope.v !== PROTOCOL_VERSION) {
    return {
      ok: false,
      error: err("unsupported_version", `Expected v=${PROTOCOL_VERSION}`),
    };
  }
  if (typeof envelope.type !== "string" || !MESSAGE_TYPES.includes(envelope.type as MessageType)) {
    return { ok: false, error: err("invalid_payload", `Unknown type ${String(envelope.type)}`) };
  }
  if (typeof envelope.id !== "string" || !envelope.id) {
    return { ok: false, error: err("invalid_payload", "Missing envelope.id") };
  }
  if (typeof envelope.ts !== "string" || !envelope.ts) {
    return { ok: false, error: err("invalid_payload", "Missing envelope.ts") };
  }
  if (!hasParty(envelope.from) || !hasParty(envelope.to)) {
    return { ok: false, error: err("invalid_payload", "from/to must be {userId, agentId}") };
  }
  if (typeof envelope.linkId !== "string" || !envelope.linkId) {
    return { ok: false, error: err("invalid_payload", "Missing linkId") };
  }
  if (typeof envelope.correlationId !== "string" || !envelope.correlationId) {
    return { ok: false, error: err("invalid_payload", "Missing correlationId") };
  }
  if (!isObject(envelope.payload)) {
    return { ok: false, error: err("invalid_payload", "payload must be an object") };
  }

  const privacyHits = findPrivacyViolations(envelope.payload);
  if (privacyHits.length > 0) {
    return {
      ok: false,
      error: err(
        "privacy_violation",
        `Forbidden fields in payload: ${privacyHits.join(", ")}`,
        false
      ),
    };
  }

  return { ok: true };
}

export type { Envelope };
