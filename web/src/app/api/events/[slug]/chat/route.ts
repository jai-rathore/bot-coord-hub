import { ensureCurrentUser } from "@/lib/users";
import { jsonError } from "@/lib/http";
import { eventBySlug, participantFor } from "@/lib/events/access";
import { loadThread } from "@/lib/events/turn";
import { hostedAgentAvailable } from "@/lib/llm";
import { rateLimit, rateLimitedJson } from "@/lib/rate-limit";
import {
  getSageCapability,
  SageCapabilityError,
} from "@/lib/sage/capabilities";
import {
  enqueueSageJob,
  ownerResultForSageJob,
} from "@/lib/sage/job-store";
import { sageJobsFeatureEnabled } from "@/lib/sage-feature";
import { boundedText } from "@/lib/validation";

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
    // `loadThread(eventId, null)` is the organizer thread. A signed-in visitor
    // who has the slug but has not joined must not fall through to that.
    const messages = isOrganizer
      ? await loadThread(event.id, null)
      : participant
        ? await loadThread(event.id, participant.id)
        : [];

    return Response.json({
      available:
        sageJobsFeatureEnabled() && hostedAgentAvailable() && event.allowChat,
      agentName: event.agentName,
      messages,
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
    if (!sageJobsFeatureEnabled() || !hostedAgentAvailable()) {
      return Response.json(
        { error: "The assistant is unavailable right now." },
        { status: 503 },
      );
    }

    // 1 turn / 3s, and 30/hour, per user.
    const burst = rateLimit(`event:chat:burst:${user.id}`, 1, 3_000);
    if (!burst.ok) return rateLimitedJson(burst);
    const hourly = rateLimit(`event:chat:hour:${user.id}`, 30, 3_600_000);
    if (!hourly.ok) return rateLimitedJson(hourly);

    const event = await eventBySlug(slug);

    let body: { message?: string; idempotencyKey?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Guardrails report the empty message.
    }

    const idempotencyKey = boundedText(
      body.idempotencyKey ?? request.headers.get("idempotency-key"),
      "idempotencyKey",
      160,
      { required: true },
    );
    const capability = getSageCapability("event_chat");
    const payload = capability.parseInput({
      eventId: event.id,
      message: body.message ?? "",
    });
    const queued = await enqueueSageJob({
      user,
      capability: capability.name,
      trigger: "user_request",
      payload,
      redactedPayload: capability.redactInput(payload),
      idempotencyKey,
    });

    return Response.json(
      {
        job: {
          id: queued.job.id,
          state: queued.job.state,
          result: ownerResultForSageJob(queued.job),
        },
        created: queued.created,
      },
      { status: queued.created ? 201 : 200 },
    );
  } catch (err) {
    if (err instanceof SageCapabilityError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return jsonError(err, "The assistant could not respond");
  }
}
