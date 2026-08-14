import {
  listDiscoveryRequests,
  requestDiscoveryInterest,
} from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requireAgent,
} from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    return jsonOk(await listDiscoveryRequests(auth));
  } catch (error) {
    return jsonFromAgentError(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJsonBody<{
      candidateHandle?: unknown;
      idempotencyKey?: unknown;
    }>(request);
    return jsonOk(
      await requestDiscoveryInterest(auth, {
        ...body,
        idempotencyKey:
          request.headers.get("idempotency-key") ?? body.idempotencyKey,
      }),
      201,
    );
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
