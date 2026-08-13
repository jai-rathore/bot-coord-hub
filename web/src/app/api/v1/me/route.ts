import { whoami } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk, requireAgent } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Agent whoami / key health.
 * GET /api/v1/me — Authorization: Bearer hm_...
 */
export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    return jsonOk(await whoami(auth));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
