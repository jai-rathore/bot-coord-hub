import { createHash, randomBytes } from "crypto";

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

export function hashGuestEmail(email: string): string {
  return createHash("sha256")
    .update(`${email.trim().toLowerCase()}.${guestPepper()}`)
    .digest("hex");
}

export function hashGuestIp(ip: string): string {
  return createHash("sha256")
    .update(`${ip}.${guestPepper()}`)
    .digest("hex");
}
