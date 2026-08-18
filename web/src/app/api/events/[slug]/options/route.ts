import { ensureCurrentUser } from "@/lib/users";
import { jsonError } from "@/lib/http";
import { boardFor, eventBySlug, participantFor } from "@/lib/events/access";
import { addOption, joinEvent } from "@/lib/events/service";
import { rateLimit, rateLimitedJson } from "@/lib/rate-limit";

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
        { error: "Sign in to suggest an option." },
        { status: 401 },
      );
    }
    const rate = rateLimit(`event:option:${user.id}`, 10);
    if (!rate.ok) return rateLimitedJson(rate);

    const event = await eventBySlug(slug);

    let body: {
      dimensionId?: string;
      startsAt?: string;
      endsAt?: string | null;
      label?: string;
    } = {};
    try {
      body = await request.json();
    } catch {
      // Validation below reports the problem.
    }
    if (!body.dimensionId) {
      return Response.json({ error: "dimensionId is required" }, { status: 400 });
    }

    const isOrganizer = event.organizerUserId === user.id;
    if (!isOrganizer) await joinEvent(event, user);
    void (await participantFor(event, user));

    await addOption(
      event,
      user,
      {
        dimensionId: body.dimensionId,
        startsAt: body.startsAt,
        endsAt: body.endsAt ?? null,
        label: body.label,
      },
      isOrganizer ? "organizer" : "participant",
    );

    return Response.json({ board: await boardFor(event.id, user) });
  } catch (err) {
    return jsonError(err, "Failed to add that option");
  }
}
