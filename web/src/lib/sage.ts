import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";
import { boundedText } from "@/lib/validation";

/** What the agent that comes with an account is called, before anyone renames it. */
export const DEFAULT_SAGE_NAME = "Sage";

/**
 * The name this person's own agent answers to.
 *
 * `users.hosted_agent_name` has been in the schema since events shipped,
 * described as the "platform-provided agent" and never surfaced. Letting
 * someone set it is what turns "Sage is your agent" from a claim in the
 * marketing copy into something the product actually behaves like: an event
 * they create is run by an agent with the name they chose.
 */
export function sageNameFor(user: Pick<User, "hostedAgentName">): string {
  return user.hostedAgentName?.trim() || DEFAULT_SAGE_NAME;
}

/**
 * Rename it, or clear the name back to the default.
 *
 * The name lands in event copy and in mail to other people, so it is bounded
 * and stripped of the characters that would let it impersonate a UI element.
 */
export async function setSageName(
  user: User,
  raw: string | null | undefined,
): Promise<string> {
  const trimmed = boundedText(raw, "agentName", 32) ?? "";
  const cleaned = trimmed.replace(/[\p{C}<>]/gu, "").trim();
  const next = cleaned || null;

  const db = getDb();
  await db
    .update(users)
    .set({ hostedAgentName: next, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  return next ?? DEFAULT_SAGE_NAME;
}
