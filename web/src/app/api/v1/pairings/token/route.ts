import { exchangeAgentPairing } from "@/lib/agent-pairing";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
} from "@/lib/http";
import {
  pairingRateLimitKey,
  rateLimit,
  rateLimitedJson,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rate = rateLimit(pairingRateLimitKey(request), 30);
  if (!rate.ok) return rateLimitedJson(rate);
  try {
    const body = await readJsonBody<{ deviceCode?: string }>(request);
    return jsonOk({ ok: true, ...(await exchangeAgentPairing(body.deviceCode)) });
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
