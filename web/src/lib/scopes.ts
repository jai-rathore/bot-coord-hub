import type { AgentAuth } from "@/lib/agent-auth";
import { AgentApiError } from "@/lib/agent-errors";

export const AGENT_SCOPES = [
  "profile:read",
  "people:read",
  "people:write",
  "tasks:read",
  "tasks:write",
  "approvals:read",
  "approvals:write",
  "guest_tasks:read",
  "guest_tasks:write",
  "intents:read",
  "intents:request",
  "discovery:read",
  "discovery:write",
  "events:read",
  "events:write",
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

/** Safe defaults deliberately exclude approvals:write. */
export const DEFAULT_AGENT_SCOPES: AgentScope[] = [
  "profile:read",
  "people:read",
  "people:write",
  "tasks:read",
  "tasks:write",
  "approvals:read",
  "guest_tasks:read",
  "guest_tasks:write",
  "intents:read",
  "intents:request",
  "discovery:read",
  "discovery:write",
  "events:read",
];

export const PAIRING_AGENT_SCOPES = DEFAULT_AGENT_SCOPES;

const AGENT_SCOPE_SET = new Set<string>(AGENT_SCOPES);

export function normalizeAgentScopes(
  value: unknown,
  allowed: readonly AgentScope[] = AGENT_SCOPES,
): AgentScope[] {
  if (!Array.isArray(value)) return [...DEFAULT_AGENT_SCOPES];
  const allow = new Set<string>(allowed);
  const normalized = [
    ...new Set(
      value
        .filter((scope): scope is string => typeof scope === "string")
        .map((scope) => scope.trim())
        .filter((scope) => AGENT_SCOPE_SET.has(scope) && allow.has(scope)),
    ),
  ] as AgentScope[];
  return normalized.length ? normalized : [...DEFAULT_AGENT_SCOPES];
}

export function hasAgentScope(auth: AgentAuth, scope: AgentScope): boolean {
  const scopes = auth.apiKey.scopes ?? [];
  return scopes.includes("*") || scopes.includes(scope);
}

export function assertAgentScope(auth: AgentAuth, scope: AgentScope): void {
  if (!hasAgentScope(auth, scope)) {
    throw new AgentApiError(403, `Agent connection requires scope: ${scope}`, {
      code: "insufficient_scope",
      requiredScope: scope,
    });
  }
}

export const LINK_SCOPES = [
  "schedule_meeting",
  "avail.read_freebusy",
] as const;

export type LinkScope = (typeof LINK_SCOPES)[number];

const LINK_SCOPE_SET = new Set<string>(LINK_SCOPES);

export function normalizeLinkScopes(value: unknown): LinkScope[] {
  if (!Array.isArray(value)) return [...LINK_SCOPES];
  const scopes = [
    ...new Set(
      value
        .filter((scope): scope is string => typeof scope === "string")
        .map((scope) => scope.trim())
        .filter((scope) => LINK_SCOPE_SET.has(scope)),
    ),
  ] as LinkScope[];
  if (!scopes.length) {
    throw new AgentApiError(400, "At least one valid relationship permission is required");
  }
  return scopes;
}

export function assertLinkScopes(
  scopes: string[] | null | undefined,
  required: readonly LinkScope[],
  peerLabel = "peer",
): void {
  const actual = scopes ?? [];
  const missing = required.filter((scope) => !actual.includes(scope));
  if (missing.length) {
    throw new AgentApiError(
      403,
      `Relationship with ${peerLabel} is missing permission: ${missing.join(", ")}`,
      { code: "relationship_scope_missing", missingScopes: missing },
    );
  }
}

export const INTENT_REQUIRED_LINK_SCOPES: Record<string, LinkScope[]> = {
  schedule_meeting: ["schedule_meeting", "avail.read_freebusy"],
};
