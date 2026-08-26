import { proposeHiringRole } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requestBaseUrl,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJsonBody<{
      targetHandle?: unknown;
      title?: unknown;
      description?: unknown;
      privateConfig?: unknown;
      idempotencyKey?: unknown;
    }>(request);
    return jsonOk(
      await proposeHiringRole(auth, body, requestBaseUrl(request)),
      201,
    );
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
