import { ensureCurrentUser } from "@/lib/users";
import { jsonError } from "@/lib/http";
import { boardFor, eventBySlug } from "@/lib/events/access";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    // The event page polls this every 15 seconds; the lookup and the auth read
    // are independent, so they no longer wait on each other.
    const [event, user] = await Promise.all([
      eventBySlug(slug),
      ensureCurrentUser(),
    ]);
    return Response.json({ board: await boardFor(event.id, user) });
  } catch (err) {
    return jsonError(err, "Failed to load event");
  }
}
