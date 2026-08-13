import { createInvite, listLinks } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requestBaseUrl,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * List links for the authenticated agent user.
 * GET /api/v1/links — Authorization: Bearer hm_...
 *
 * Also accepts POST as an alias of /api/v1/links/invite for convenience.
 */
export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    return jsonOk(await listLinks(auth, requestBaseUrl(request)));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}

export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    let body: {
      toEmail?: string;
      toName?: string;
      scopes?: string[];
      expiresInHours?: number;
    } = {};
    try {
      body = await readJsonBody(request);
    } catch {
      // Shared validation reports a recipient requirement.
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
