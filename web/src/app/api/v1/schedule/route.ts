import {
  requireAgent,
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requestBaseUrl,
} from "@/lib/http";
import { requestScheduleMeeting } from "@/lib/agent-api";

export const dynamic = "force-dynamic";

/**
 * Request a schedule_meeting session: free/busy propose → confirm gate → book.
 * POST /api/v1/schedule — Authorization: Bearer hm_...
 *
 * Body supports peerEmail (pairwise) or peerEmails (3+ group).
 */
export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await readJsonBody<{
      peerEmail?: string;
      peerEmails?: string[];
      linkId?: string;
      durationMinutes?: number;
      windowStart?: string;
      windowEnd?: string;
      timezone?: string;
      title?: string;
      notes?: string;
      idempotencyKey?: string;
    }>(request);
    return jsonOk(
      await requestScheduleMeeting(auth, {
        ...body,
        idempotencyKey:
          request.headers.get("idempotency-key") ?? body.idempotencyKey,
        origin: requestBaseUrl(request),
      }),
      201,
    );
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
