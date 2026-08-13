import { revokeLink } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk, requireAgent } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Agent revoke link.
 * POST /api/v1/links/:id/revoke
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAgent(_request);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await context.params;
    return jsonOk(await revokeLink(auth, id));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
