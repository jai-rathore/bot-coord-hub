import { isAgentAuth, jsonFromAgentError, readJsonBody, requireAgent } from "@/lib/http";
import { agentAddEventOption } from "@/lib/events/agent-api";

export const dynamic = "force-dynamic";

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
      await agentAddEventOption(auth, { ...body, eventId: id }),
    );
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
