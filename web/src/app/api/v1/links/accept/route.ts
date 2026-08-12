import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";
import { acceptInvite } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requestBaseUrl,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Accept a peer invite.
 * POST /api/v1/links/accept — Authorization: Bearer hm_...
 * Body: { inviteCode }
 */
export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  try {
    const body = await readJsonBody<{ inviteCode?: string }>(request);
    return jsonOk(await acceptInvite(auth, body, requestBaseUrl(request)));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
