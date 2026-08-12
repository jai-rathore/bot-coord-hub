import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";
import { createInvite, listLinks } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requestBaseUrl,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * List links for the authenticated agent user.
 * GET /api/v1/links — Authorization: Bearer hm_...
 *
 * Also accepts POST as an alias of /api/v1/links/invite for convenience.
 */
export async function GET(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  try {
    return jsonOk(await listLinks(auth, requestBaseUrl(request)));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}

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
      // open invite with empty body is ok
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
