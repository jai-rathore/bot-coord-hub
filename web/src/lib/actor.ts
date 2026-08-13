import type { AgentAuth } from "@/lib/agent-auth";
import type { User } from "@/db/schema";

export type ActorContext = {
  user: User;
  kind: "user" | "agent" | "guest" | "system";
  apiKeyId?: string | null;
};

export function humanActor(user: User): ActorContext {
  return { user, kind: "user", apiKeyId: null };
}

export function agentActor(auth: AgentAuth): ActorContext {
  return { user: auth.user, kind: "agent", apiKeyId: auth.apiKey.id };
}
