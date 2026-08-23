import { createInvite } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requestBaseUrl,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Create a peer invite.
 * POST /api/v1/links/invite: Authorization: Bearer hm_...
 * Body: { toEmail, toName?, scopes?, confirmRequired?, timezone?, allowedHours? }
 */
export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    let body: {
      toEmail?: string;
      toName?: string;
      scopes?: string[];
      expiresInHours?: number;
      confirmRequired?: boolean;
      timezone?: string | null;
      allowedHours?: {
        start: string;
        end: string;
        days?: number[];
      } | null;
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
