import { listInbox } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk, requireAgent } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/v1/inbox — pending work from other people's agents. */
export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    return jsonOk(await listInbox(auth));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
