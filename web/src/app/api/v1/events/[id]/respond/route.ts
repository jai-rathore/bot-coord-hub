import {
  isAgentAuth,
  jsonFromAgentError,
  readJsonBody,
  requireAgent,
  requestBaseUrl,
} from "@/lib/http";
import { agentRespondToEvent } from "@/lib/events/agent-api";

export const dynamic = "force-dynamic";

/** `id` accepts an event id or a share slug: an agent is handed the link. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAgent(request);
  if (!isAgentAuth(auth)) return auth;
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    return Response.json(
      await agentRespondToEvent(
        auth,
        { ...body, eventId: id },
        requestBaseUrl(request),
      ),
    );
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
