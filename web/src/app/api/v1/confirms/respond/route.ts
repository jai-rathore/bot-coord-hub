import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";
import { respondConfirm } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Respond to a confirm gate after human OK.
 * POST /api/v1/confirms/respond — Authorization: Bearer hm_...
 * Body: { action: approve|decline|defer, confirmId?|sessionId?, note? }
 */
export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  try {
    const body = await readJsonBody<{
      confirmId?: string;
      sessionId?: string;
      action?: string;
      note?: string;
    }>(request);
    return jsonOk(await respondConfirm(auth, body));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
