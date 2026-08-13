import { isGuestToken, requireGuestToken } from "@/lib/guest-auth";
import { readGuestTask } from "@/lib/guest-tasks";
import { jsonFromAgentError, jsonOk } from "@/lib/http";
import {
  guestRateLimitKey,
  rateLimit,
  rateLimitedJson,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ publicId: string }> };

export async function GET(request: Request, context: Context) {
  const token = requireGuestToken(request);
  if (!isGuestToken(token)) return token;
  const rate = rateLimit(guestRateLimitKey(request, token.slice(0, 12)), 30);
  if (!rate.ok) return rateLimitedJson(rate);

  try {
    const { publicId } = await context.params;
    return jsonOk({ ok: true, task: await readGuestTask(publicId, token) });
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
