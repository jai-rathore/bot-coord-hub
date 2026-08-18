import { ensureCurrentUser } from "@/lib/users";
import { jsonError } from "@/lib/http";
import { createEvent, listEventsForUser } from "@/lib/events/service";
import { assertEventsEnabled } from "@/lib/events/access";
import { clientIpFromHeaders, rateLimit, rateLimitedJson } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    assertEventsEnabled();
    const user = await ensureCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json(await listEventsForUser(user));
  } catch (err) {
    return jsonError(err, "Failed to list events");
  }
}

export async function POST(request: Request) {
  try {
    assertEventsEnabled();
    const user = await ensureCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const rate = rateLimit(
      `event:create:${user.id}:${clientIpFromHeaders(request.headers)}`,
      10,
    );
    if (!rate.ok) return rateLimitedJson(rate);

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // Shared validation reports the missing fields.
    }

    const event = await createEvent(user, body as never);
    return Response.json(
      { event: { id: event.id, shareSlug: event.shareSlug, title: event.title } },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, "Failed to create event");
  }
}
