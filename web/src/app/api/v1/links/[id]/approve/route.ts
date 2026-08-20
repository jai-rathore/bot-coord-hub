import { approveConnection } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  requestBaseUrl,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Approve an incoming public-page or public-invite connection request.
 * POST /api/v1/links/:id/approve
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await context.params;
    return jsonOk(
      await approveConnection(auth, { linkId: id }, requestBaseUrl(request)),
    );
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
