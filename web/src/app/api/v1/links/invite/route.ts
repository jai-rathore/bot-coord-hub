import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";
import { createInvite } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requestBaseUrl,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Create a peer invite.
 * POST /api/v1/links/invite — Authorization: Bearer hm_...
 * Body: { toEmail?, toName?, scopes? } — omit toEmail for an open handshake URL.
 */
export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  try {
    let body: {
      toEmail?: string;
      toName?: string;
      scopes?: string[];
    } = {};
    try {
      body = await readJsonBody(request);
    } catch {
      body = {};
    }
    return jsonOk(
      await createInvite(auth, body, requestBaseUrl(request)),
      201,
    );
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
