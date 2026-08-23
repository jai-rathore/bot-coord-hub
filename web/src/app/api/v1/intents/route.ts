import { listIntents } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk, requireAgent } from "@/lib/http";
import { assertAgentScope } from "@/lib/scopes";

export const dynamic = "force-dynamic";

/**
 * List intent registry (agent).
 * GET /api/v1/intents?q=: Authorization: Bearer hm_...
 */
export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    assertAgentScope(auth, "intents:read");
    const q = new URL(request.url).searchParams.get("q") ?? undefined;
    return jsonOk(await listIntents(q));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
