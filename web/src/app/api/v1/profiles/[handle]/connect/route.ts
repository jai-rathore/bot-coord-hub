import { requestAgentConnection } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk, requireAgent } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ handle: string }> },
) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  const { handle } = await context.params;
  try {
    return jsonOk(await requestAgentConnection(auth, { handle }), 201);
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
