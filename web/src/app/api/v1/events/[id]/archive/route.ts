import { isAgentAuth, jsonFromAgentError, readJsonBody, requireAgent } from "@/lib/http";
import { agentArchiveEvent } from "@/lib/events/agent-api";

export const dynamic = "force-dynamic";

/**
 * Hide or restore an event on this human's list.
 * POST /api/v1/events/:id/archive — { archived?: boolean }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAgent(request);
  if (!isAgentAuth(auth)) return auth;
  try {
    const { id } = await params;
    const body = await readJsonBody(request).catch(() => ({}));
    return Response.json(
      await agentArchiveEvent(auth, { ...body, eventId: id }),
    );
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
