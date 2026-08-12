import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";
import { readBoard } from "@/lib/agent-api";
import { jsonFromAgentError, jsonOk } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Read a session board.
 * GET /api/v1/sessions/:id/board — Authorization: Bearer hm_...
 */
export async function GET(request: Request, context: Ctx) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  try {
    const { id } = await context.params;
    return jsonOk(await readBoard(auth, id));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
