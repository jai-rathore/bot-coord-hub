import { discoveryFeatureEnabled } from "@/lib/discovery-feature";
import { distributedRateLimit } from "@/lib/distributed-rate-limit";
import { jsonError, readJsonBody } from "@/lib/http";
import { hostedAgentAvailable } from "@/lib/llm";
import {
  enqueueSageDiscoveryMessage,
  publicSageDiscoveryThread,
  selectSageDiscoveryLocation,
} from "@/lib/sage/discovery-conversation";
import { getSageCapability } from "@/lib/sage/capabilities";
import { enqueueSageJob } from "@/lib/sage/job-store";
import { sageJobsFeatureEnabled } from "@/lib/sage-feature";
import { boundedText } from "@/lib/validation";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

function unavailable() {
  return !sageJobsFeatureEnabled() || !discoveryFeatureEnabled();
}

export async function GET(request: Request) {
  if (unavailable()) {
    return Response.json(
      { error: "Sage discovery is temporarily unavailable" },
      { status: 503 },
    );
  }
  const user = await ensureCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const intentSlug = boundedText(
      new URL(request.url).searchParams.get("intentSlug"),
      "intentSlug",
      100,
    );
    if (!intentSlug) {
      return Response.json({ error: "intentSlug is required" }, { status: 400 });
    }
    return Response.json({
      thread: await publicSageDiscoveryThread({ user, intentSlug }),
    });
  } catch (error) {
    return jsonError(error, "Failed to load Sage discovery conversation");
  }
}

export async function POST(request: Request) {
  if (unavailable()) {
    return Response.json(
      { error: "Sage discovery is temporarily unavailable" },
      { status: 503 },
    );
  }
  const user = await ensureCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    let rate: Awaited<ReturnType<typeof distributedRateLimit>>;
    try {
      rate = await distributedRateLimit(`sage:discovery:${user.id}`, 40);
    } catch {
      return Response.json(
        { error: "Sage discovery is temporarily unavailable" },
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }
    if (!rate.ok) {
      return Response.json(
        {
          error: "Sage discovery request limit exceeded",
          retryAfterSec: rate.retryAfterSec,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSec) },
        },
      );
    }
    const body = await readJsonBody(request);
    const action = boundedText(body.action, "action", 80);
    const intentSlug = boundedText(body.intentSlug, "intentSlug", 100);
    if (!action || !intentSlug) {
      return Response.json(
        { error: "action and intentSlug are required" },
        { status: 400 },
      );
    }

    if (action === "message") {
      if (!hostedAgentAvailable()) {
        return Response.json(
          { error: "Sage conversation is temporarily unavailable" },
          { status: 503 },
        );
      }
      const clientMessageId = boundedText(
        body.clientMessageId ?? request.headers.get("idempotency-key"),
        "clientMessageId",
        160,
      );
      if (!clientMessageId) {
        return Response.json(
          { error: "clientMessageId is required" },
          { status: 400 },
        );
      }
      const queued = await enqueueSageDiscoveryMessage({
        user,
        intentSlug,
        message: body.message,
        clientMessageId,
      });
      return Response.json(
        {
          threadId: queued.threadId,
          job: { id: queued.job.id, state: queued.job.state },
          created: queued.created,
        },
        { status: queued.created ? 201 : 200 },
      );
    }

    if (action === "select_location") {
      const threadId = boundedText(body.threadId, "threadId", 100);
      const target = boundedText(body.target, "target", 120);
      const resolutionToken = boundedText(
        body.resolutionToken,
        "resolutionToken",
        4_000,
      );
      if (!threadId || !target || !resolutionToken) {
        return Response.json(
          { error: "threadId, target, and resolutionToken are required" },
          { status: 400 },
        );
      }
      await selectSageDiscoveryLocation({
        user,
        threadId,
        target,
        resolutionToken,
      });
      return Response.json({
        thread: await publicSageDiscoveryThread({ user, intentSlug }),
      });
    }

    if (action === "prepare_review") {
      const threadId = boundedText(body.threadId, "threadId", 100);
      if (!threadId) {
        return Response.json({ error: "threadId is required" }, { status: 400 });
      }
      const capability = getSageCapability("discovery_prepare_enrollment");
      const payload = capability.parseInput({ threadId });
      const idempotencyKey = boundedText(
        body.idempotencyKey ?? request.headers.get("idempotency-key"),
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
        { job: { id: queued.job.id, state: queued.job.state } },
        { status: queued.created ? 201 : 200 },
      );
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return jsonError(error, "Sage discovery request failed");
  }
}
