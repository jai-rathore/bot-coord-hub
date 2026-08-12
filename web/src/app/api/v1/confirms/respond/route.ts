import { respondConfirm } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Respond to a confirm gate after human OK.
 * POST /api/v1/confirms/respond — Authorization: Bearer hm_...
 * Body: { action: approve|decline|defer, confirmId?|sessionId?, note? }
 *
 * When all participants approve, CalendarPort books the event.
 */
export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await readJsonBody<{
      confirmId?: string;
      sessionId?: string;
      action?: string;
      note?: string;
    }>(request);
    return jsonOk(await respondConfirm(auth, body));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
