import { ensureCurrentUser } from "@/lib/users";
import { jsonError } from "@/lib/http";
import { boardFor, eventBySlug } from "@/lib/events/access";
import {
  cancelEvent,
  extendDeadline,
  lockEvent,
  rotateShareSlug,
} from "@/lib/events/service";
import { rateLimit, rateLimitedJson } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Organizer-only controls. Each action re-checks ownership in the service. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const user = await ensureCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const rate = rateLimit(`event:control:${user.id}`, 30);
    if (!rate.ok) return rateLimitedJson(rate);

    const event = await eventBySlug(slug);

    let body: { action?: string; deadlineAt?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Reported below.
    }

    let nextSlug = event.shareSlug;
    switch (body.action) {
      case "lock":
        await lockEvent(event, user);
        break;
      case "cancel":
        await cancelEvent(event, user);
        break;
      case "extend":
        if (!body.deadlineAt) {
          return Response.json(
            { error: "deadlineAt is required" },
            { status: 400 },
          );
        }
        await extendDeadline(event, user, body.deadlineAt);
        break;
      case "rotate":
        nextSlug = await rotateShareSlug(event, user);
        break;
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }

    return Response.json({
      shareSlug: nextSlug,
      board: await boardFor(event.id, user),
    });
  } catch (err) {
    return jsonError(err, "Failed to update the event");
  }
}
