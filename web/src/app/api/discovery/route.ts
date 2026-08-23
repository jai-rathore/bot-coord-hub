import { ensureCurrentUser } from "@/lib/users";
import {
  blockDiscoveryParticipant,
  decideDiscoveryEnrollment,
  decideDiscoveryInterest,
  listDiscoveryCatalog,
  listDiscoveryInterests,
  listUserDiscoveryAudit,
  reportDiscoveryParticipant,
  requestDiscoveryIntroduction,
  submitDiscoveryEnrollment,
  type CoarseLocationInput,
} from "@/lib/discovery-service";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";
import { distributedRateLimit } from "@/lib/distributed-rate-limit";
import { jsonError } from "@/lib/http";
import { resolveLocationSuggestions } from "@/lib/location-resolver";

export const dynamic = "force-dynamic";

async function currentUserOrResponse() {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

export async function GET() {
  const user = await currentUserOrResponse();
  if (user instanceof Response) return user;
  try {
    const [intents, interests, audit] = await Promise.all([
      listDiscoveryCatalog(user.id, { includeOwnerReview: true }),
      listDiscoveryInterests(user.id, { includeStableIds: true }),
      listUserDiscoveryAudit(user.id),
    ]);
    return Response.json({
      intents,
      interests,
      audit: audit.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return jsonError(error, "Failed to load discovery");
  }
}

export async function POST(request: Request) {
  const user = await currentUserOrResponse();
  if (user instanceof Response) return user;
  try {
    const body = (await request.json()) as {
      action?: unknown;
      query?: unknown;
      granularity?: unknown;
      countryCode?: unknown;
      limit?: unknown;
      intentSlug?: unknown;
      claims?: unknown;
      provenance?: unknown;
      location?: CoarseLocationInput | null;
      requestActivation?: unknown;
      enrollmentId?: unknown;
      snapshotHash?: unknown;
      decision?: unknown;
      interestId?: unknown;
      reasonCode?: unknown;
      details?: unknown;
      block?: boolean;
      candidateHandle?: unknown;
      idempotencyKey?: unknown;
    };
    if (
      body.action === "submit_enrollment" ||
      body.action === "resolve_location" ||
      body.action === "request_introduction"
    ) {
      if (!discoveryFeatureEnabled()) {
        return Response.json(
          {
            error: "Discovery is temporarily unavailable",
            code: "discovery_disabled",
          },
          { status: 503 },
        );
      }
      let rate: Awaited<ReturnType<typeof distributedRateLimit>>;
      try {
        rate = await distributedRateLimit(
          body.action === "resolve_location"
            ? `human-location:${user.id}`
            : body.action === "request_introduction"
              ? `human-interest:${user.id}`
              : `human:${user.id}`,
          body.action === "resolve_location"
            ? 60
            : body.action === "request_introduction"
              ? 10
              : 30,
        );
      } catch {
        return Response.json(
          {
            error: "Discovery is temporarily unavailable",
            code: "rate_limiter_unavailable",
            retryAfterSec: 5,
          },
          { status: 503, headers: { "Retry-After": "5" } },
        );
      }
      if (!rate.ok) {
        return Response.json(
          { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
          { status: 429 },
        );
      }
      if (body.action === "resolve_location") {
        let daily: Awaited<ReturnType<typeof distributedRateLimit>>;
        try {
          daily = await distributedRateLimit(
            `human-location:daily:${user.id}`,
            600,
            24 * 60 * 60 * 1000,
          );
        } catch {
          return Response.json(
            {
              error: "Discovery is temporarily unavailable",
              code: "rate_limiter_unavailable",
              retryAfterSec: 5,
            },
            { status: 503, headers: { "Retry-After": "5" } },
          );
        }
        if (!daily.ok) {
          return Response.json(
            {
              error: "Daily location lookup limit exceeded",
              retryAfterSec: daily.retryAfterSec,
            },
            { status: 429 },
          );
        }
      }
    }
    switch (body.action) {
      case "resolve_location":
        return Response.json(
          await resolveLocationSuggestions({
            userId: user.id,
            query: body.query,
            granularity: body.granularity,
            countryCode: body.countryCode,
            limit: body.limit,
          }),
        );
      case "submit_enrollment":
        return Response.json({
          enrollment: await submitDiscoveryEnrollment(
            { user, kind: "user" },
            {
              intentSlug: body.intentSlug,
              claims: body.claims,
              provenance: body.provenance,
              location: body.location,
              requestActivation: body.requestActivation,
            },
          ),
        });
      case "decide_enrollment":
        if (
          typeof body.enrollmentId !== "string" ||
          !["approve", "pause", "revoke"].includes(String(body.decision))
        ) {
          return Response.json(
            { error: "enrollmentId and a valid decision are required" },
            { status: 400 },
          );
        }
        return Response.json({
          enrollment: await decideDiscoveryEnrollment({
            user,
            enrollmentId: body.enrollmentId,
            decision: body.decision as "approve" | "pause" | "revoke",
            snapshotHash:
              typeof body.snapshotHash === "string"
                ? body.snapshotHash
                : undefined,
          }),
        });
      case "decide_interest":
        if (
          typeof body.interestId !== "string" ||
          !["confirm_request", "accept", "decline"].includes(
            String(body.decision),
          )
        ) {
          return Response.json(
            { error: "interestId and a valid decision are required" },
            { status: 400 },
          );
        }
        return Response.json({
          interest: await decideDiscoveryInterest({
            user,
            interestId: body.interestId,
            decision: body.decision as
              | "confirm_request"
              | "accept"
              | "decline",
          }),
        });
      case "request_introduction":
        if (typeof body.candidateHandle !== "string") {
          return Response.json(
            { error: "candidateHandle is required" },
            { status: 400 },
          );
        }
        return Response.json({
          interest: await requestDiscoveryIntroduction({
            actor: { user, kind: "user" },
            candidateHandle: body.candidateHandle,
            idempotencyKey:
              typeof body.idempotencyKey === "string"
                ? body.idempotencyKey
                : undefined,
          }),
        });
      case "block":
        if (typeof body.interestId !== "string") {
          return Response.json(
            { error: "interestId is required" },
            { status: 400 },
          );
        }
        return Response.json({
          result: await blockDiscoveryParticipant({
            actor: { user, kind: "user" },
            interestId: body.interestId,
            reasonCode: body.reasonCode,
          }),
        });
      case "report":
        if (typeof body.interestId !== "string") {
          return Response.json(
            { error: "interestId is required" },
            { status: 400 },
          );
        }
        return Response.json({
          result: await reportDiscoveryParticipant({
            actor: { user, kind: "user" },
            interestId: body.interestId,
            reasonCode: body.reasonCode,
            details: body.details,
            block: body.block,
          }),
        });
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return jsonError(error, "Discovery action failed");
  }
}
