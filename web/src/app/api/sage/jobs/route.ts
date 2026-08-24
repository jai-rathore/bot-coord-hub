import { ensureCurrentUser } from "@/lib/users";
import { jsonError } from "@/lib/http";
import { distributedRateLimit } from "@/lib/distributed-rate-limit";
import {
  getSageCapability,
  SageCapabilityError,
} from "@/lib/sage/capabilities";
import {
  enqueueSageJob,
  listSageJobsForUser,
  ownerResultForSageJob,
} from "@/lib/sage/job-store";
import { boundedText } from "@/lib/validation";
import { sageJobsFeatureEnabled } from "@/lib/sage-feature";

export const dynamic = "force-dynamic";

function publicJob(job: Awaited<ReturnType<typeof listSageJobsForUser>>[number]) {
  return {
    id: job.id,
    capability: job.capability,
    trigger: job.trigger,
    state: job.state,
    attempts: job.attempts,
    result: ownerResultForSageJob(job),
    lastError:
      job.state === "failed" || job.state === "dead_letter"
        ? "Sage could not complete this task. Try again or contact support if it keeps happening."
        : null,
    runAt: job.runAt.toISOString(),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

export async function GET() {
  if (!sageJobsFeatureEnabled()) {
    return Response.json({ error: "Sage tasks are temporarily unavailable" }, { status: 503 });
  }
  const user = await ensureCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const jobs = await listSageJobsForUser(user.id);
    return Response.json({ jobs: jobs.map(publicJob) });
  } catch (error) {
    return jsonError(error, "Failed to load Sage work");
  }
}

export async function POST(request: Request) {
  if (!sageJobsFeatureEnabled()) {
    return Response.json({ error: "Sage tasks are temporarily unavailable" }, { status: 503 });
  }
  const user = await ensureCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let rate: Awaited<ReturnType<typeof distributedRateLimit>>;
  try {
    rate = await distributedRateLimit(`sage:enqueue:${user.id}`, 30);
  } catch {
    return Response.json(
      { error: "Sage tasks are temporarily unavailable", retryAfterSec: 5 },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }
  if (!rate.ok) {
    return Response.json(
      { error: "Sage request limit exceeded", retryAfterSec: rate.retryAfterSec },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      },
    );
  }

  try {
    const body = (await request.json()) as {
      capability?: unknown;
      payload?: unknown;
      idempotencyKey?: unknown;
    };
    if (typeof body.capability !== "string") {
      return Response.json({ error: "capability is required" }, { status: 400 });
    }
    if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
      return Response.json({ error: "payload must be an object" }, { status: 400 });
    }

    const capability = getSageCapability(body.capability);
    const payload = capability.parseInput(body.payload as Record<string, unknown>);
    if (
      [
        "schedule_meeting",
        "coordinate_event",
        "run_guest_request",
        "manage_connections",
      ].includes(capability.name) &&
      !payload.origin
    ) {
      payload.origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? new URL(request.url).origin;
    }
    const headerKey = request.headers.get("idempotency-key");
    const idempotencyKey = boundedText(
      typeof body.idempotencyKey === "string"
        ? body.idempotencyKey
        : headerKey,
      "idempotencyKey",
      160,
    );
    const queued = await enqueueSageJob({
      user,
      capability: capability.name,
      trigger: "user_request",
      payload,
      redactedPayload: capability.redactInput(payload),
      idempotencyKey,
    });

    return Response.json(
      { job: publicJob(queued.job), created: queued.created },
      { status: queued.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof SageCapabilityError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return jsonError(error, "Failed to ask Sage");
  }
}
