import { ackInbox } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk, requireAgent } from "@/lib/http";

export const dynamic = "force-dynamic";

/** POST /api/v1/inbox/:id/ack */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    const { id } = await params;
    return jsonOk(await ackInbox(auth, id));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
