import { revokePublicInvite } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk, requireAgent } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    const { id } = await context.params;
    return jsonOk(await revokePublicInvite(auth, id));
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
