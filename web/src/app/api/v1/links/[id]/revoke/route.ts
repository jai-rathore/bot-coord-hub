import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";
import { revokeLink } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Agent revoke link.
 * POST /api/v1/links/:id/revoke
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateAgent(_request);
  if (!auth) return unauthorizedJson();

  try {
    const { id } = await context.params;
    return jsonOk(await revokeLink(auth, id));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
