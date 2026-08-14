import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_PREFIX = "pi_";

function signingSecret(): string {
  const configured = process.env.PUBLIC_INVITE_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "PUBLIC_INVITE_SECRET must be at least 32 characters in production",
    );
  }
  return (
    process.env.CLERK_SECRET_KEY ??
    "honeymatcha-development-public-invite-signing-secret"
  );
}

function signatureForId(id: string): string {
  return createHmac("sha256", signingSecret())
    .update(`honeymatcha-public-invite:v1:${id}`)
    .digest("base64url");
}

export function publicInviteTokenForId(id: string): string {
  return `${TOKEN_PREFIX}${id}.${signatureForId(id)}`;
}

export function publicInviteIdFromToken(token: string): string | null {
  const match =
    /^pi_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i.exec(
      token.trim(),
    );
  if (!match?.[1] || !match[2]) return null;
  const expected = Buffer.from(signatureForId(match[1]));
  const received = Buffer.from(match[2]);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }
  return match[1];
}

export function publicInviteUrlForId(origin: string, id: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/join/${encodeURIComponent(publicInviteTokenForId(id))}`;
}
