import { listBoardMessages, postBoardMessage } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Session board messages.
 * GET  /api/v1/sessions/:id/messages
 * POST /api/v1/sessions/:id/messages — { kind, body?, text? }
 */
export async function GET(request: Request, context: Ctx) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await context.params;
    return jsonOk(await listBoardMessages(auth, id));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}

export async function POST(request: Request, context: Ctx) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await context.params;
    const body = await readJsonBody<{
      kind?: string;
      body?: Record<string, unknown>;
      text?: string;
    }>(request);
    return jsonOk(await postBoardMessage(auth, id, body), 201);
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
