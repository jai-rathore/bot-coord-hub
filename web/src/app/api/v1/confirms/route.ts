import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";
import { listConfirms, requestConfirm } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Confirm gates for the authenticated user.
 * Human-gated by default — dashboard: /app/confirm.
 * GET  /api/v1/confirms?status=pending|approved|denied
 * POST /api/v1/confirms — request { sessionId, action, note?, metadata?, confirmUserId? }
 */
export async function GET(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  try {
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    const status =
      statusParam === "pending" ||
      statusParam === "approved" ||
      statusParam === "denied"
        ? statusParam
        : undefined;
    return jsonOk(await listConfirms(auth, status));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  try {
    const body = await readJsonBody<{
      sessionId?: string;
      action?: string;
      note?: string;
      metadata?: Record<string, unknown>;
      confirmUserId?: string;
    }>(request);
    return jsonOk(await requestConfirm(auth, body), 201);
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
