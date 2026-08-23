import { listPeople } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk, requireAgent } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * People met through events who are not yet a connection.
 * GET /api/v1/people: Authorization: Bearer hm_...
 */
export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    return jsonOk(await listPeople(auth));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
