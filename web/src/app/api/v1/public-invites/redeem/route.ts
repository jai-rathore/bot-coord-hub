import { redeemPublicInvite } from "@/lib/agent-api";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
  requireAgent,
} from "@/lib/http";
import {
  publicInviteRateLimitKey,
  rateLimit,
  rateLimitedJson,
  rateLimitHeaders,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJsonBody<{ token?: string }>(request);
    const limit = rateLimit(
      publicInviteRateLimitKey(request, body.token ?? ""),
      20,
    );
    if (!limit.ok) return rateLimitedJson(limit);
    return jsonOk(
      await redeemPublicInvite(auth, body),
      200,
      rateLimitHeaders(limit),
    );
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
