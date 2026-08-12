import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";
import { proposeIntent } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Propose a new intent (agent).
 * POST /api/v1/intents/propose — Authorization: Bearer hm_...
 */
export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  try {
    const body = await readJsonBody<{
      name?: string;
      slug?: string;
      description?: string;
      force?: boolean;
    }>(request);
    return jsonOk(await proposeIntent(auth, body), 201);
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
