import { ensureCurrentUser, updateNotificationPrefs } from "@/lib/users";
import { jsonError } from "@/lib/http";
import { boardFor, eventBySlug } from "@/lib/events/access";
import { setNotifyUpdates } from "@/lib/events/service";
import { wantsSms, parseNotifyChannel } from "@/lib/phone";
import { AgentApiError } from "@/lib/agent-errors";
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

    let body: { notify?: unknown; phone?: unknown; channel?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      // Defaults below.
    }

    let nextUser = user;
    if (body.phone !== undefined || body.channel !== undefined) {
      nextUser = await updateNotificationPrefs(user, {
        phone: body.phone,
        channel: body.channel,
      });
    }

    const notify = body.notify !== false;
    if (
      notify &&
      wantsSms(parseNotifyChannel(nextUser.notifyChannel)) &&
      !nextUser.phoneE164
    ) {
      throw new AgentApiError(400, "Add a mobile number to get texts.");
    }

    await setNotifyUpdates(event, nextUser, notify);
    return Response.json({ board: await boardFor(event.id, nextUser) });
  } catch (err) {
    return jsonError(err, "Could not update notifications");
  }
}
