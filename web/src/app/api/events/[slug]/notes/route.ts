import { ensureCurrentUser } from "@/lib/users";
import { jsonError } from "@/lib/http";
import { boardFor, eventBySlug, participantFor } from "@/lib/events/access";
import {
  joinEvent,
  publishNote,
  removeNoteAndRefresh,
  retractNoteAndRefresh,
} from "@/lib/events/service";
import { isNoteVisibility } from "@/lib/events/notes";
import { rateLimit, rateLimitedJson } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The composer on the event page. Same writes Sage makes through `post_note`,
 * so a note typed by hand and a note the assistant recorded are the same row
 * with the same rules — including the visibility downgrade on a private board,
 * which comes back as `notice` for the UI to show.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const user = await ensureCurrentUser();
    if (!user) {
      return Response.json(
        { error: "Sign in to add a note to this event." },
        { status: 401 },
      );
    }
    const rate = rateLimit(`event:note:${user.id}`, 12);
    if (!rate.ok) return rateLimitedJson(rate);

    const event = await eventBySlug(slug);

    let body: {
      body?: string;
      visibility?: string;
      optionId?: string | null;
    } = {};
    try {
      body = await request.json();
    } catch {
      // postNote reports the empty body.
    }

    const isOrganizer = event.organizerUserId === user.id;
    // Leaving a note is engaging with the event, exactly as responding is.
    const participant = isOrganizer
      ? await participantFor(event, user)
      : ((await participantFor(event, user)) ?? (await joinEvent(event, user)));

    const { notice } = await publishNote({
      event,
      user,
      participant,
      input: {
        body: body.body ?? "",
        visibility: isNoteVisibility(body.visibility)
          ? body.visibility
          : "everyone",
        optionId: body.optionId ?? null,
        source: "ui",
      },
    });

    return Response.json({ board: await boardFor(event.id, user), notice });
  } catch (err) {
    return jsonError(err, "Failed to add your note");
  }
}

/**
 * Taking a note down. The author retracts their own; the organizer removes
 * anyone's. Which of the two applies is decided from the caller's real role
 * here, never from the request body.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const user = await ensureCurrentUser();
    if (!user) {
      return Response.json({ error: "Sign in first." }, { status: 401 });
    }
    const rate = rateLimit(`event:note:remove:${user.id}`, 20);
    if (!rate.ok) return rateLimitedJson(rate);

    const event = await eventBySlug(slug);
    const noteId = new URL(request.url).searchParams.get("noteId") ?? "";
    if (!noteId) {
      return Response.json({ error: "Which note?" }, { status: 400 });
    }

    if (event.organizerUserId === user.id) {
      await removeNoteAndRefresh({ event, user, noteId });
    } else {
      await retractNoteAndRefresh({ event, user, noteId });
    }

    return Response.json({ board: await boardFor(event.id, user) });
  } catch (err) {
    return jsonError(err, "Failed to remove that note");
  }
}
