import { startAgentPairing } from "@/lib/agent-pairing";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requestBaseUrl,
} from "@/lib/http";
import {
  pairingRateLimitKey,
  rateLimit,
  rateLimitedJson,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rate = rateLimit(pairingRateLimitKey(request), 10);
  if (!rate.ok) return rateLimitedJson(rate);
  try {
    const body = await readJsonBody<{
      agentName?: string;
      requestedScopes?: string[];
    }>(request);
    return jsonOk(
      {
        ok: true,
        ...(await startAgentPairing({
          agentName: body.agentName,
          requestedScopes: body.requestedScopes,
          origin: requestBaseUrl(request),
        })),
      },
      201,
    );
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
