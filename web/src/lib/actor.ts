import type { AgentAuth } from "@/lib/agent-auth";
import type { User } from "@/db/schema";

export type ActorMode =
  | "human"
  | "hosted_agent"
  | "external_agent"
  | "guest"
  | "system";

export type ActorContext = {
  user: User;
  mode: ActorMode;
  /** Value persisted in the existing audit/session actor_kind columns. */
  kind: "user" | "agent" | "hosted_agent" | "guest" | "system";
  apiKeyId?: string | null;
  runId?: string | null;
  scopes?: readonly string[];
};

export function humanActor(user: User): ActorContext {
  return { user, mode: "human", kind: "user", apiKeyId: null };
}

export function agentActor(auth: AgentAuth): ActorContext {
  return {
    user: auth.user,
    mode: "external_agent",
    kind: "agent",
    apiKeyId: auth.apiKey.id,
    scopes: auth.apiKey.scopes,
  };
}

export function hostedAgentActor(user: User, runId: string): ActorContext {
  return {
    user,
    mode: "hosted_agent",
    kind: "hosted_agent",
    apiKeyId: null,
    runId,
  };
}
