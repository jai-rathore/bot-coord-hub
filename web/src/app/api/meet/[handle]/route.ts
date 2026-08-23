import { ensureCurrentUser } from "@/lib/users";
import { jsonError, requestBaseUrl } from "@/lib/http";
import { isMeetChoice, recordMeeting } from "@/lib/meet";
import { clientIpFromHeaders, rateLimit, rateLimitedJson } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * "I just met this person." Called from the handle page after a scan.
 *
 * Sign-in is required: an event needs two real accounts: but the choice of
 * what to set up is made before signing in and replayed here, so the tap that
 * happens in front of the other person is never the one that hits a wall.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  try {
    const user = await ensureCurrentUser();
    if (!user) {
      return Response.json(
        { error: "Sign in to set this up." },
        { status: 401 },
      );
    }

    const rate = rateLimit(
      `meet:${user.id}:${clientIpFromHeaders(request.headers)}`,
      10,
    );
    if (!rate.ok) return rateLimitedJson(rate);

    const { handle } = await params;

    let body: { intent?: unknown; timezone?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      // Validated below.
    }
    if (!isMeetChoice(body.intent)) {
      return Response.json(
        { error: "Pick coffee, lunch, drinks, call, or connect." },
        { status: 400 },
      );
    }

    return Response.json(
      await recordMeeting({
        scanner: user,
        handle,
        intent: body.intent,
        timezone: body.timezone,
        origin: requestBaseUrl(request),
      }),
    );
  } catch (err) {
    return jsonError(err, "Could not set that up");
  }
}
