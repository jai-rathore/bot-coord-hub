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
    const event = await eventBySlug(slug);
    const user = await ensureCurrentUser();
    return Response.json({ board: await boardFor(event.id, user) });
  } catch (err) {
    return jsonError(err, "Failed to load event");
  }
}
