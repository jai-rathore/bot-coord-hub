import {
  createPublicInvite,
  listPublicInvites,
} from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requestBaseUrl,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    return jsonOk(await listPublicInvites(auth, requestBaseUrl(request)));
  } catch (error) {
    return jsonFromAgentError(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJsonBody<{
      label?: unknown;
      scopes?: unknown;
      confirmRequired?: boolean;
      expiresInHours?: unknown;
      maxRedemptions?: unknown;
    }>(request);
    return jsonOk(
      await createPublicInvite(auth, body, requestBaseUrl(request)),
      201,
    );
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
