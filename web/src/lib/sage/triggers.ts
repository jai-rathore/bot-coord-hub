import {
  canEnqueueSageTrigger,
  enqueueSageJob,
  type SageTrigger,
} from "@/lib/sage/job-store";
import { sageJobsFeatureEnabled } from "@/lib/sage-feature";

export type SageTriggerRoute = "sage" | "external" | "unavailable";

export type ActivityTriggerContext = {
  userId: string;
  sourceId: string;
  trigger: Extract<SageTrigger, "inbox" | "deadline" | "approval_result">;
  sessionId?: string | null;
  eventId?: string | null;
};

export function activityPayloadForTrigger(
  context: Pick<ActivityTriggerContext, "sessionId" | "eventId">,
): Record<string, unknown> {
  if (context.eventId) {
    return { action: "event", eventRef: context.eventId };
  }
  if (context.sessionId) {
    return { action: "session", sessionId: context.sessionId };
  }
  return { action: "overview", pendingOnly: true, limit: 20 };
}

/**
 * Route a domain trigger to exactly one selected operator. This helper never
 * fails the domain write that produced the trigger: the durable inbox/session
 * remains available for a later manual review if Sage infrastructure is down.
 */
export async function enqueueSageActivityTrigger(
  context: ActivityTriggerContext,
): Promise<SageTriggerRoute> {
  if (!sageJobsFeatureEnabled()) return "unavailable";

  try {
    if (!(await canEnqueueSageTrigger(context.userId, context.trigger))) {
      return "external";
    }

    const payload = activityPayloadForTrigger(context);
    await enqueueSageJob({
      user: { id: context.userId },
      capability: "review_activity",
      trigger: context.trigger,
      payload,
      redactedPayload: {
        action: payload.action,
        pendingOnly: payload.pendingOnly ?? null,
        limit: payload.limit ?? null,
        hasInboxId: false,
        hasSessionId: Boolean(payload.sessionId),
        hasEventRef: Boolean(payload.eventRef),
      },
      idempotencyKey: `${context.trigger}:${context.sourceId}`,
      runAt:
        context.trigger === "approval_result"
          ? new Date(Date.now() + 1_000)
          : undefined,
    });
    return "sage";
  } catch (error) {
    console.error("[sage] activity trigger enqueue failed", error);
    return "unavailable";
  }
}
