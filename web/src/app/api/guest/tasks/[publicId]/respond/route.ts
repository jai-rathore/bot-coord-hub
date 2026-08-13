import { isGuestToken, requireGuestToken } from "@/lib/guest-auth";
import { respondToGuestTask } from "@/lib/guest-tasks";
import {
  jsonFromAgentError,
  jsonOk,
  readJsonBody,
} from "@/lib/http";
import {
  clientIpFromHeaders,
  guestRateLimitKey,
  rateLimit,
  rateLimitedJson,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ publicId: string }> };

export async function POST(request: Request, context: Context) {
  const token = requireGuestToken(request);
  if (!isGuestToken(token)) return token;
  const rate = rateLimit(guestRateLimitKey(request, token.slice(0, 12)), 10);
  if (!rate.ok) return rateLimitedJson(rate);

  try {
    const { publicId } = await context.params;
    const body = await readJsonBody<{
      email?: string;
      response?: Record<string, unknown>;
    }>(request);
    const result = await respondToGuestTask({
      publicId,
      rawToken: token,
      email: body.email,
      response: body.response,
      idempotencyKey: request.headers.get("idempotency-key"),
      clientIp: clientIpFromHeaders(request.headers),
    });
    return jsonOk(result);
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
