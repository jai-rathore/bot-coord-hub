import { isAgentAuth, jsonFromAgentError, requireAgent } from "@/lib/http";
import { agentNudgeEventParticipants } from "@/lib/events/agent-api";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAgent(request);
  if (!isAgentAuth(auth)) return auth;
  try {
    const { id } = await params;
    return Response.json(await agentNudgeEventParticipants(auth, { eventId: id }));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
