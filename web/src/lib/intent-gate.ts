import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { intentTypes } from "@/db/schema";
import { AgentApiError } from "@/lib/agent-errors";
import { validateIntentDefinition } from "@/lib/intent-contract";

export async function requireSupportedIntent(slug: string) {
  const [intent] = await getDb()
    .select()
    .from(intentTypes)
    .where(and(eq(intentTypes.slug, slug), eq(intentTypes.status, "live")))
    .limit(1);

  if (!intent) {
    throw new AgentApiError(
      400,
      `Task type "${slug}" is not currently supported`,
      { code: "unsupported_task_type", taskType: slug },
    );
  }
  if (!intent.discoveryEnabled) {
    return { ...intent, validatedDefinition: null };
  }
  try {
    return {
      ...intent,
      validatedDefinition: validateIntentDefinition(intent.definition),
    };
  } catch {
    throw new AgentApiError(
      503,
      `Task type "${slug}" has an invalid runtime definition`,
      { code: "invalid_intent_definition", taskType: slug },
    );
  }
}
