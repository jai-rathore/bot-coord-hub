import { ensureCurrentUser } from "@/lib/users";
import { jsonError } from "@/lib/http";
import { boardFor, eventBySlug, participantFor } from "@/lib/events/access";
import { joinEvent, setResponses, type ResponseEntry } from "@/lib/events/service";
import { rateLimit, rateLimitedJson } from "@/lib/rate-limit";
import type { EventPref } from "@/lib/events/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const user = await ensureCurrentUser();
    if (!user) {
      return Response.json(
        { error: "Sign in to respond to this event." },
        { status: 401 },
      );
    }
    const rate = rateLimit(`event:respond:${user.id}`, 20);
    if (!rate.ok) return rateLimitedJson(rate);

    const event = await eventBySlug(slug);

    let body: { entries?: ResponseEntry[]; attendance?: EventPref } = {};
    try {
      body = await request.json();
    } catch {
      // Validation below reports the problem.
    }

    // Responding implies joining; keeps the flow to a single tap.
    const participant =
      (await participantFor(event, user)) ?? (await joinEvent(event, user));

    const entries = Array.isArray(body.entries) ? body.entries : [];
    await setResponses(event, participant, entries, body.attendance);

    return Response.json({ board: await boardFor(event.id, user) });
  } catch (err) {
    return jsonError(err, "Failed to save your response");
  }
}
