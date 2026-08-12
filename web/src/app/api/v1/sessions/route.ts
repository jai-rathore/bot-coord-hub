import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";
import { listSessions } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * List sessions for the authenticated agent user.
 * GET /api/v1/sessions — Authorization: Bearer hm_...
 */
export async function GET(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  try {
    return jsonOk(await listSessions(auth));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
