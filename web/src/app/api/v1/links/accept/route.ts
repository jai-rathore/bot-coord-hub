import { acceptInvite } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requestBaseUrl,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Accept a peer invite.
 * POST /api/v1/links/accept: Authorization: Bearer hm_...
 * Body: { inviteCode }
 */
export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await readJsonBody<{ inviteCode?: string }>(request);
    return jsonOk(await acceptInvite(auth, body, requestBaseUrl(request)));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
