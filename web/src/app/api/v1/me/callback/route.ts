import { setAgentCallback } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/** POST /api/v1/me/callback: register an optional inbox webhook. */
export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJsonBody<{
      callbackUrl?: string | null;
      callbackAuthorization?: string | null;
    }>(request);
    return jsonOk(
      await setAgentCallback(
        auth,
        body.callbackUrl ?? null,
        body.callbackAuthorization,
      ),
    );
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
