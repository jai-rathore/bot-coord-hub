import { createSession, listSessions } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Sessions for the authenticated agent user.
 * GET  /api/v1/sessions
 * POST /api/v1/sessions — { intentType, peerUserId?, linkId?, payload? }
 */
export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    return jsonOk(await listSessions(auth));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}

export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await readJsonBody<{
      intentType?: string;
      peerUserId?: string;
      linkId?: string;
      payload?: Record<string, unknown>;
      idempotencyKey?: string;
    }>(request);
    return jsonOk(
      await createSession(auth, {
        ...body,
        idempotencyKey:
          request.headers.get("idempotency-key") ?? body.idempotencyKey,
      }),
      201,
    );
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
