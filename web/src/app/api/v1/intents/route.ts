import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";
import { listIntents } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * List intent registry (agent).
 * GET /api/v1/intents?q= — Authorization: Bearer hm_...
 */
export async function GET(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  try {
    const q = new URL(request.url).searchParams.get("q") ?? undefined;
    return jsonOk(await listIntents(q));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
