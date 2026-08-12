import type { ApiKeyRecord, HubData } from "./types.js";

export interface AuthContext {
  key: string;
  userId: string;
  agentId: string;
  label: string;
}

export function parseBearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1]?.trim() || null;
}

export function authenticate(
  data: HubData,
  authorizationHeader: string | undefined
): AuthContext | null {
  const key = parseBearer(authorizationHeader);
  if (!key) return null;
  const rec: ApiKeyRecord | undefined = data.apiKeys.find((k) => k.key === key);
  if (!rec) return null;
  return {
    key: rec.key,
    userId: rec.userId,
    agentId: rec.agentId,
    label: rec.label,
  };
}
