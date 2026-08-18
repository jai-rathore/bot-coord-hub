import { isAgentAuth, jsonFromAgentError, requireAgent, requestBaseUrl } from "@/lib/http";
import { agentGetEventBoard } from "@/lib/events/agent-api";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAgent(request);
  if (!isAgentAuth(auth)) return auth;
  try {
    const { id } = await params;
    return Response.json(
      await agentGetEventBoard(auth, id, requestBaseUrl(request)),
    );
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
