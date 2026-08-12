import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";
import { postBoardMessage } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Post a board message.
 * POST /api/v1/sessions/:id/messages — Authorization: Bearer hm_...
 * Body: { kind, body? }
 */
export async function POST(request: Request, context: Ctx) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  try {
    const { id } = await context.params;
    const body = await readJsonBody<{
      kind?: string;
      body?: Record<string, unknown>;
    }>(request);
    return jsonOk(await postBoardMessage(auth, id, body), 201);
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
