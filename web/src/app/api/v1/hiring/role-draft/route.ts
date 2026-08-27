import { draftHiringRole } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJsonBody<{
      sourceUrl?: unknown;
      description?: unknown;
    }>(request);
    return jsonOk(
      await draftHiringRole(auth, body, request.signal),
    );
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
