import { isAgentAuth, jsonFromAgentError, requireAgent, requestBaseUrl } from "@/lib/http";
import { agentJoinEvent } from "@/lib/events/agent-api";

export const dynamic = "force-dynamic";

/** `id` accepts an event id or a share slug — an agent is handed the link. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAgent(request);
  if (!isAgentAuth(auth)) return auth;
  try {
    const { id } = await params;
    return Response.json(
      await agentJoinEvent(auth, { eventId: id }, requestBaseUrl(request)),
    );
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
