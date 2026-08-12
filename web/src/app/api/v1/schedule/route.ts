import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";
import { requestScheduleMeeting } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Request a schedule_meeting session + confirm gate.
 * Does not auto-book calendar (stub).
 * POST /api/v1/schedule — Authorization: Bearer hm_...
 */
export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  try {
    const body = await readJsonBody<{
      peerEmail?: string;
      linkId?: string;
      durationMinutes?: number;
      windowStart?: string;
      windowEnd?: string;
      timezone?: string;
      title?: string;
      notes?: string;
    }>(request);
    return jsonOk(await requestScheduleMeeting(auth, body), 201);
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
