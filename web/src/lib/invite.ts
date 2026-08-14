import { randomBytes } from "crypto";
import { LINK_SCOPES } from "@/lib/scopes";

export function generateInviteCode(): string {
  const part = () =>
    randomBytes(3)
      .toString("base64url")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4);
  return `HM-${part()}-${part()}-${part()}-${part()}`;
}

export function inviteUrlForCode(origin: string, inviteCode: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/invite/${encodeURIComponent(inviteCode)}`;
}

export function requestOrigin(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "localhost:3000";
  return `${proto}://${host}`;
}

export const DEFAULT_LINK_SCOPES = LINK_SCOPES;
