import { ensureCurrentUser } from "@/lib/users";
import {
  blockDiscoveryParticipant,
  decideDiscoveryEnrollment,
  decideDiscoveryInterest,
  listDiscoveryCatalog,
  listDiscoveryInterests,
  listUserDiscoveryAudit,
  reportDiscoveryParticipant,
  submitDiscoveryEnrollment,
  type CoarseLocationInput,
} from "@/lib/discovery-service";
import { distributedRateLimit } from "@/lib/distributed-rate-limit";
import { errorMessage, errorStatus } from "@/lib/http";

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
    return Response.json(
      { error: errorMessage(error) },
      { status: errorStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  const user = await currentUserOrResponse();
  if (user instanceof Response) return user;
  try {
    const rate = await distributedRateLimit(`human:${user.id}`, 30);
    if (!rate.ok) {
      return Response.json(
        { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
        { status: 429 },
      );
    }
    const body = (await request.json()) as {
      action?: unknown;
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
    };
    switch (body.action) {
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
    return Response.json(
      { error: errorMessage(error) },
      { status: errorStatus(error) },
    );
  }
}
