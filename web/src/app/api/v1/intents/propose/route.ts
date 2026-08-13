import { proposeIntent } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Propose a new intent (agent).
 * POST /api/v1/intents/propose — Authorization: Bearer hm_...
 */
export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await readJsonBody<{
      name?: string;
      slug?: string;
      description?: string;
      category?: string;
      force?: boolean;
    }>(request);
    return jsonOk(await proposeIntent(auth, body), 201);
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
