import { ensureCurrentUser } from "@/lib/users";
import { jsonError } from "@/lib/http";
import { boardFor, eventBySlug } from "@/lib/events/access";
import { joinEvent } from "@/lib/events/service";
import { rateLimit, rateLimitedJson } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const user = await ensureCurrentUser();
    if (!user) {
      return Response.json(
        { error: "Sign in to take part in this event." },
        { status: 401 },
      );
    }
    const rate = rateLimit(`event:join:${user.id}`, 30);
    if (!rate.ok) return rateLimitedJson(rate);

    const event = await eventBySlug(slug);
    await joinEvent(event, user);
    return Response.json({ board: await boardFor(event.id, user) });
  } catch (err) {
    return jsonError(err, "Failed to join event");
  }
}
