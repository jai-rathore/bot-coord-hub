import { and, asc, eq, gte, gt, isNull, lte, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  discoveryCadences,
  intentTypes,
  notificationOutbox,
  purposeEnrollments,
  userSafety,
  users,
  type User,
} from "@/db/schema";
import { AgentApiError } from "@/lib/agent-errors";
import { deliverDiscoveryInbox } from "@/lib/agent-inbox";
import { humanChannelsFor, parseNotifyChannel } from "@/lib/phone";
import {
  canEnqueueSageTrigger,
  enqueueSageJob,
} from "@/lib/sage/job-store";
import { smsOffered } from "@/lib/sms-flag";

const MIN_INTERVAL_HOURS = 24;
const MAX_INTERVAL_HOURS = 720;
const MAX_RECOMMENDATIONS = 10;
const DAILY_AUTOMATIC_SEARCH_BUDGET = 1;

export type PublicDiscoveryCadence = {
  intentSlug: string;
  enabled: boolean;
  intervalHours: number;
  maxRecommendations: number;
  notifyOnNew: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastOutcome: string | null;
};

function toPublicCadence(
  row: typeof discoveryCadences.$inferSelect,
): PublicDiscoveryCadence {
  return {
    intentSlug: row.intentSlug,
    enabled: row.enabled,
    intervalHours: row.intervalHours,
    maxRecommendations: row.maxRecommendations,
    notifyOnNew: row.notifyOnNew,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastOutcome: row.lastOutcome,
  };
}

export function validatedDiscoveryCadence(input: {
  intervalHours?: unknown;
  maxRecommendations?: unknown;
}) {
  const intervalHours = Number(input.intervalHours ?? 168);
  const maxRecommendations = Number(input.maxRecommendations ?? 3);
  if (
    !Number.isInteger(intervalHours) ||
    intervalHours < MIN_INTERVAL_HOURS ||
    intervalHours > MAX_INTERVAL_HOURS
  ) {
    throw new AgentApiError(400, "Discovery cadence must be between 24 and 720 hours");
  }
  if (
    !Number.isInteger(maxRecommendations) ||
    maxRecommendations < 1 ||
    maxRecommendations > MAX_RECOMMENDATIONS
  ) {
    throw new AgentApiError(400, "Recommendation limit must be between 1 and 10");
  }
  return { intervalHours, maxRecommendations };
}

export async function listDiscoveryCadences(
  userId: string,
): Promise<PublicDiscoveryCadence[]> {
  const rows = await getDb()
    .select()
    .from(discoveryCadences)
    .where(eq(discoveryCadences.userId, userId))
    .orderBy(asc(discoveryCadences.intentSlug));
  return rows.map(toPublicCadence);
}

export async function setDiscoveryCadence(opts: {
  user: User;
  intentSlug: string;
  enabled: boolean;
  intervalHours?: unknown;
  maxRecommendations?: unknown;
  notifyOnNew?: boolean;
}): Promise<PublicDiscoveryCadence> {
  const intentSlug = opts.intentSlug.trim();
  if (!intentSlug) throw new AgentApiError(400, "intentSlug is required");
  const { intervalHours, maxRecommendations } = validatedDiscoveryCadence(opts);
  const db = getDb();
  if (opts.enabled) {
    const [enrollment] = await db
      .select({ id: purposeEnrollments.id })
      .from(purposeEnrollments)
      .innerJoin(
        intentTypes,
        and(
          eq(intentTypes.slug, purposeEnrollments.intentSlug),
          eq(intentTypes.definitionVersion, purposeEnrollments.definitionVersion),
        ),
      )
      .where(
        and(
          eq(purposeEnrollments.userId, opts.user.id),
          eq(purposeEnrollments.intentSlug, intentSlug),
          eq(purposeEnrollments.status, "active"),
          eq(intentTypes.status, "live"),
          eq(intentTypes.discoveryEnabled, true),
          or(
            isNull(purposeEnrollments.expiresAt),
            gt(purposeEnrollments.expiresAt, new Date()),
          ),
        ),
      )
      .limit(1);
    if (!enrollment) {
      throw new AgentApiError(
        409,
        "Activate and approve this discovery enrollment before enabling automatic search",
      );
    }
  }
  const [existing] = await db
    .select()
    .from(discoveryCadences)
    .where(
      and(
        eq(discoveryCadences.userId, opts.user.id),
        eq(discoveryCadences.intentSlug, intentSlug),
      ),
    )
    .limit(1);
  const nextRunAt = opts.enabled
    ? existing?.enabled && existing.nextRunAt
      ? existing.nextRunAt
      : new Date()
    : null;
  const [saved] = await db
    .insert(discoveryCadences)
    .values({
      userId: opts.user.id,
      intentSlug,
      enabled: opts.enabled,
      intervalHours,
      maxRecommendations,
      notifyOnNew: opts.notifyOnNew ?? true,
      nextRunAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [discoveryCadences.userId, discoveryCadences.intentSlug],
      set: {
        enabled: opts.enabled,
        intervalHours,
        maxRecommendations,
        notifyOnNew: opts.notifyOnNew ?? true,
        nextRunAt,
        updatedAt: new Date(),
      },
    })
    .returning();
  return toPublicCadence(saved);
}

export async function notifyForDiscoveryRecommendations(input: {
  userId: string;
  intentSlug: string;
  count: number;
  sourceJobId: string;
}) {
  if (input.count <= 0) return 0;
  const db = getDb();
  const [row] = await db
    .select({
      cadence: discoveryCadences,
      notifyChannel: users.notifyChannel,
      phoneE164: users.phoneE164,
    })
    .from(discoveryCadences)
    .innerJoin(users, eq(discoveryCadences.userId, users.id))
    .where(
      and(
        eq(discoveryCadences.userId, input.userId),
        eq(discoveryCadences.intentSlug, input.intentSlug),
        eq(discoveryCadences.enabled, true),
        eq(discoveryCadences.notifyOnNew, true),
      ),
    )
    .limit(1);
  if (!row) return 0;
  const channels = humanChannelsFor({
    channel: parseNotifyChannel(row.notifyChannel),
    phoneE164: row.phoneE164,
    smsOffered: smsOffered(),
  });
  if (channels.length === 0) return 0;
  const inserted = await db
    .insert(notificationOutbox)
    .values(
      channels.map((channel) => ({
        userId: input.userId,
        channel,
        template: "discovery_recommendations",
        payload: {
          count: input.count,
          intentSlug: input.intentSlug,
          title: "New anonymous possibilities",
        },
        dedupeKey: `discovery:${input.sourceJobId}:${channel}`,
      })),
    )
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
    .returning({ id: notificationOutbox.id });
  return inserted.length;
}

export type DiscoveryDispatchResult = {
  scanned: number;
  sageQueued: number;
  externalNotified: number;
  budgetDeferred: number;
  ineligible: number;
  failed: number;
};

export async function dispatchDueDiscoveryCadences(
  now = new Date(),
  limit = 50,
): Promise<DiscoveryDispatchResult> {
  const db = getDb();
  const due = await db
    .select()
    .from(discoveryCadences)
    .where(
      and(
        eq(discoveryCadences.enabled, true),
        lte(discoveryCadences.nextRunAt, now),
      ),
    )
    .orderBy(asc(discoveryCadences.nextRunAt))
    .limit(Math.max(1, Math.min(200, limit)));
  const result: DiscoveryDispatchResult = {
    scanned: due.length,
    sageQueued: 0,
    externalNotified: 0,
    budgetDeferred: 0,
    ineligible: 0,
    failed: 0,
  };

  for (const cadence of due) {
    const nextRunAt = new Date(now.getTime() + cadence.intervalHours * 3600_000);
    const [claimed] = await db
      .update(discoveryCadences)
      .set({
        nextRunAt,
        lastRunAt: now,
        lastOutcome: "dispatching",
        updatedAt: now,
      })
      .where(
        and(
          eq(discoveryCadences.id, cadence.id),
          eq(discoveryCadences.enabled, true),
          lte(discoveryCadences.nextRunAt, now),
        ),
      )
      .returning();
    if (!claimed) continue;

    try {
      const [recentAutomatic] = await db
        .select({ id: discoveryCadences.id })
        .from(discoveryCadences)
        .where(
          and(
            eq(discoveryCadences.userId, cadence.userId),
            ne(discoveryCadences.id, cadence.id),
            gte(
              discoveryCadences.lastRunAt,
              new Date(now.getTime() - 24 * 3600_000),
            ),
          ),
        )
        .limit(DAILY_AUTOMATIC_SEARCH_BUDGET);
      const currentRanWithinBudget = Boolean(
        cadence.lastRunAt &&
          cadence.lastRunAt >= new Date(now.getTime() - 24 * 3600_000),
      );
      if (currentRanWithinBudget || recentAutomatic) {
        await db
          .update(discoveryCadences)
          .set({ lastOutcome: "daily_budget_deferred", updatedAt: new Date() })
          .where(eq(discoveryCadences.id, cadence.id));
        result.budgetDeferred += 1;
        continue;
      }

      const [eligibility] = await db
        .select({
          enrollmentId: purposeEnrollments.id,
          safetyStatus: userSafety.status,
        })
        .from(purposeEnrollments)
        .innerJoin(
          intentTypes,
          and(
            eq(intentTypes.slug, purposeEnrollments.intentSlug),
            eq(intentTypes.definitionVersion, purposeEnrollments.definitionVersion),
          ),
        )
        .leftJoin(userSafety, eq(userSafety.userId, cadence.userId))
        .where(
          and(
            eq(purposeEnrollments.userId, cadence.userId),
            eq(purposeEnrollments.intentSlug, cadence.intentSlug),
            eq(purposeEnrollments.status, "active"),
            eq(intentTypes.status, "live"),
            eq(intentTypes.discoveryEnabled, true),
            or(
              isNull(purposeEnrollments.expiresAt),
              gt(purposeEnrollments.expiresAt, now),
            ),
          ),
        )
        .limit(1);
      if (!eligibility || (eligibility.safetyStatus && eligibility.safetyStatus !== "active")) {
        await db
          .update(discoveryCadences)
          .set({ lastOutcome: "ineligible", updatedAt: new Date() })
          .where(eq(discoveryCadences.id, cadence.id));
        result.ineligible += 1;
        continue;
      }

      const idempotencyKey = `cadence:${cadence.id}:${cadence.nextRunAt?.toISOString() ?? now.toISOString()}`;
      if (!(await canEnqueueSageTrigger(cadence.userId, "scheduled"))) {
        await deliverDiscoveryInbox({
          userId: cadence.userId,
          kind: "discovery.search_due",
          summary: `Your recurring ${cadence.intentSlug.replaceAll("_", " ")} search is due.`,
          body: {
            intentSlug: cadence.intentSlug,
            limit: cadence.maxRecommendations,
            instructions:
              "Run a privacy-safe discovery search for your human. Do not request an introduction without their approval.",
          },
          dedupeKey: idempotencyKey,
        });
        await db
          .update(discoveryCadences)
          .set({ lastOutcome: "external_operator_notified", updatedAt: new Date() })
          .where(eq(discoveryCadences.id, cadence.id));
        result.externalNotified += 1;
        continue;
      }

      const queued = await enqueueSageJob({
        user: { id: cadence.userId },
        capability: "discovery_search",
        trigger: "scheduled",
        payload: {
          intentSlug: cadence.intentSlug,
          limit: cadence.maxRecommendations,
          onlyNewRecommendations: true,
        },
        redactedPayload: {
          intentSlug: cadence.intentSlug,
          limit: cadence.maxRecommendations,
          onlyNewRecommendations: true,
        },
        idempotencyKey,
        maxAttempts: 3,
      });
      await db
        .update(discoveryCadences)
        .set({
          lastJobId: queued.job.id,
          lastOutcome: queued.created ? "sage_queued" : "sage_replayed",
          updatedAt: new Date(),
        })
        .where(eq(discoveryCadences.id, cadence.id));
      result.sageQueued += queued.created ? 1 : 0;
    } catch (error) {
      console.error("[sage] discovery cadence dispatch failed", cadence.id, error);
      await db
        .update(discoveryCadences)
        .set({
          nextRunAt: new Date(Date.now() + 15 * 60_000),
          lastOutcome: "dispatch_failed",
          updatedAt: new Date(),
        })
        .where(eq(discoveryCadences.id, cadence.id));
      result.failed += 1;
    }
  }
  return result;
}
