import { ensureCurrentUser } from "@/lib/users";
import { jsonError } from "@/lib/http";
import { eventBySlug, participantFor } from "@/lib/events/access";
import { joinEvent } from "@/lib/events/service";
import { loadThread, runEventChatTurn } from "@/lib/events/turn";
import { hostedAgentAvailable } from "@/lib/llm";
import { rateLimit, rateLimitedJson } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const user = await ensureCurrentUser();
    if (!user) return Response.json({ messages: [], available: false });

    const event = await eventBySlug(slug);
    const isOrganizer = event.organizerUserId === user.id;
    const participant = await participantFor(event, user);

    return Response.json({
      available: hostedAgentAvailable() && event.allowChat,
      agentName: event.agentName,
      messages: await loadThread(
        event.id,
        isOrganizer ? null : (participant?.id ?? null),
      ),
    });
  } catch (err) {
    return jsonError(err, "Failed to load the conversation");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const user = await ensureCurrentUser();
    if (!user) {
      return Response.json(
        { error: "Sign in to use the assistant." },
        { status: 401 },
      );
    }

    // 1 turn / 3s, and 30/hour, per user.
    const burst = rateLimit(`event:chat:burst:${user.id}`, 1, 3_000);
    if (!burst.ok) return rateLimitedJson(burst);
    const hourly = rateLimit(`event:chat:hour:${user.id}`, 30, 3_600_000);
    if (!hourly.ok) return rateLimitedJson(hourly);

    const event = await eventBySlug(slug);
    const isOrganizer = event.organizerUserId === user.id;

    let body: { message?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Guardrails report the empty message.
    }

    const participant = isOrganizer
      ? await participantFor(event, user)
      : ((await participantFor(event, user)) ?? (await joinEvent(event, user)));

    const result = await runEventChatTurn({
      event,
      user,
      participant,
      role: isOrganizer ? "organizer" : "participant",
      message: body.message ?? "",
    });

    return Response.json({
      reply: result.reply,
      board: result.board,
      applied: result.applied,
      turnsRemaining: Number.isFinite(result.turnsRemaining)
        ? result.turnsRemaining
        : null,
    });
  } catch (err) {
    return jsonError(err, "The assistant could not respond");
  }
}
