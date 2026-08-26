import { isGuestToken, requireGuestToken } from "@/lib/guest-auth";
import { readGuestTask } from "@/lib/guest-tasks";
import { jsonFromAgentError, jsonOk, readJsonBody } from "@/lib/http";
import { resolveLocationSuggestions } from "@/lib/location-resolver";
import {
  guestRateLimitKey,
  rateLimit,
  rateLimitedJson,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ publicId: string }> };

export async function POST(request: Request, context: Context) {
  const token = requireGuestToken(request);
  if (!isGuestToken(token)) return token;
  const rate = rateLimit(guestRateLimitKey(request, token.slice(0, 12)), 30);
  if (!rate.ok) return rateLimitedJson(rate);

  try {
    const { publicId } = await context.params;
    const task = await readGuestTask(publicId, token);
    if (task.taskType !== "hiring_compatibility") {
      return Response.json(
        { error: "Location search is not available for this request" },
        { status: 400 },
      );
    }
    const body = await readJsonBody<{
      query?: unknown;
      granularity?: unknown;
      limit?: unknown;
    }>(request);
    return jsonOk(
      await resolveLocationSuggestions({
        userId: `guest-task:${publicId}`,
        query: body.query,
        granularity: body.granularity,
        limit: body.limit,
      }),
    );
  } catch (error) {
    return jsonFromAgentError(error);
  }
}
