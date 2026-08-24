import { createHash, randomBytes, timingSafeEqual } from "crypto";

const GUEST_PREFIX = "gt_";

export function generateGuestToken(): {
  rawToken: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  const rawToken = `${GUEST_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    rawToken,
    tokenHash: hashGuestToken(rawToken),
    tokenPrefix: rawToken.slice(0, 12),
  };
}

export function hashGuestToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function extractGuestToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Guest\s+(gt_[A-Za-z0-9_-]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

function guestPepper(): string {
  const configured = process.env.GUEST_TOKEN_PEPPER;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("GUEST_TOKEN_PEPPER is required in production");
  }
  return "honeymatcha-development-guest-pepper";
}

function sharedGuestIdentitySecret(): string {
  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (encryptionKey) return encryptionKey;
  return guestPepper();
}

function hashGuestEmailWithSecret(email: string, secret: string): string {
  return createHash("sha256")
    .update(`${email.trim().toLowerCase()}.${secret}`)
    .digest("hex");
}

/**
 * Email binding is created by both the web service and the Sage worker, so it
 * uses their shared encryption key. Local and pre-migration environments fall
 * back to the original guest pepper.
 */
export function hashGuestEmail(email: string): string {
  return hashGuestEmailWithSecret(email, sharedGuestIdentitySecret());
}

/** Accept bindings written before Sage guest creation moved to the worker. */
export function matchesGuestEmailHash(storedHash: string, email: string): boolean {
  const candidates = [hashGuestEmail(email)];
  const legacyPepper = process.env.GUEST_TOKEN_PEPPER;
  if (legacyPepper && legacyPepper !== process.env.TOKEN_ENCRYPTION_KEY) {
    candidates.push(hashGuestEmailWithSecret(email, legacyPepper));
  }
  const stored = Buffer.from(storedHash, "hex");
  return candidates.some((candidate) => {
    const value = Buffer.from(candidate, "hex");
    return stored.length === value.length && timingSafeEqual(stored, value);
  });
}

export function hashGuestIp(ip: string): string {
  return createHash("sha256")
    .update(`${ip}.${guestPepper()}`)
    .digest("hex");
}
