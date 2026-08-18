import { isAgentAuth, jsonFromAgentError, readJsonBody, requireAgent, requestBaseUrl } from "@/lib/http";
import { agentCreateEvent, agentListEvents } from "@/lib/events/agent-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if (!isAgentAuth(auth)) return auth;
  try {
    return Response.json(await agentListEvents(auth));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}

export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (!isAgentAuth(auth)) return auth;
  try {
    const body = await readJsonBody(request);
    return Response.json(
      await agentCreateEvent(auth, body, requestBaseUrl(request)),
      { status: 201 },
    );
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
