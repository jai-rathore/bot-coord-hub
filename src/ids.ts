import { randomBytes } from "node:crypto";

export function nowIso(): string {
  return new Date().toISOString();
}

export function uid(prefix: string): string {
  const rand = randomBytes(6).toString("hex");
  return `${prefix}_${rand}`;
}

export function inviteCode(): string {
  const part = () =>
    randomBytes(3)
      .toString("base64url")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4);
  return `BC-${part()}-${part()}`;
}

export function msgId(): string {
  return uid("msg");
}
