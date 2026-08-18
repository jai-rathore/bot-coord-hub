import { ensureCurrentUser } from "@/lib/users";
import { jsonError } from "@/lib/http";
import { boardFor, eventBySlug } from "@/lib/events/access";
import { setNotifyUpdates } from "@/lib/events/service";
import { rateLimit, rateLimitedJson } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Opt in or out of update notifications. Joins the event if needed. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const user = await ensureCurrentUser();
    if (!user) {
      return Response.json(
        { error: "Sign in to get updates about this event." },
        { status: 401 },
      );
    }
    const rate = rateLimit(`event:subscribe:${user.id}`, 30);
    if (!rate.ok) return rateLimitedJson(rate);

    const event = await eventBySlug(slug);

    let body: { notify?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      // Defaults below.
    }
    await setNotifyUpdates(event, user, body.notify !== false);
    return Response.json({ board: await boardFor(event.id, user) });
  } catch (err) {
    return jsonError(err, "Could not update notifications");
  }
}
