import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";
import { listConfirms } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * List confirm gates for the authenticated user.
 * Human-gated by default — dashboard: /app/confirm.
 * GET /api/v1/confirms — Authorization: Bearer hm_...
 */
export async function GET(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  try {
    return jsonOk(await listConfirms(auth));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
