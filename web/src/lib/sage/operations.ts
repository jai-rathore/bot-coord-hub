import {
  and,
  asc,
  avg,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  isNotNull,
  lt,
  lte,
  min,
  or,
  sql,
  sum,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  llmDailyUsage,
  llmProviderCircuits,
  llmProviderLeases,
  notificationOutbox,
  sageJobs,
  sageRuns,
  users,
  type User,
} from "@/db/schema";
import { AgentApiError } from "@/lib/agent-errors";

const ACTIVE_STATES = ["pending", "running", "waiting_human"] as const;
const RECOVERABLE_STATES = ["failed", "dead_letter"] as const;

export type SageOperationsAlert = {
  key:
    | "queue_age"
    | "dead_letters"
    | "repeated_retries"
    | "provider_failures"
    | "provider_circuit";
  severity: "warning" | "critical";
  message: string;
};

export type SageOperationsSnapshot = {
  generatedAt: string;
  counts: Record<string, number>;
  oldestPendingAgeSeconds: number;
  repeatedRetryJobs: number;
  recentFailedRuns: number;
  recentProviderFailures: number;
  recentAverageLatencyMs: number;
  recentInputTokens: number;
  recentOutputTokens: number;
  activeProviderLeases: number;
  openProviderCircuits: number;
  todayProviderInputTokens: number;
  todayProviderOutputTokens: number;
  estimatedProviderCostUsd: number | null;
  alerts: SageOperationsAlert[];
};

function configuredTokenCost(): {
  inputPerMillion: number;
  outputPerMillion: number;
} | null {
  const inputPerMillion = Number(process.env.SAGE_INPUT_COST_PER_MILLION_USD);
  const outputPerMillion = Number(process.env.SAGE_OUTPUT_COST_PER_MILLION_USD);
  if (
    !Number.isFinite(inputPerMillion) ||
    inputPerMillion < 0 ||
    !Number.isFinite(outputPerMillion) ||
    outputPerMillion < 0
  ) {
    return null;
  }
  return { inputPerMillion, outputPerMillion };
}

export async function sageOperationsSnapshot(
  now = new Date(),
): Promise<SageOperationsSnapshot> {
  const db = getDb();
  const recentSince = new Date(now.getTime() - 15 * 60_000);
  const usageDay = now.toISOString().slice(0, 10);
  const [
    stateRows,
    [oldestPending],
    [retryRows],
    [runRows],
    [providerRows],
    [dailyUsageRows],
  ] = await Promise.all([
    db
      .select({ state: sageJobs.state, total: count() })
      .from(sageJobs)
      .groupBy(sageJobs.state),
    db
      .select({ createdAt: min(sageJobs.runAt) })
      .from(sageJobs)
      .where(
        and(eq(sageJobs.state, "pending"), lte(sageJobs.runAt, now)),
      ),
    db
      .select({ total: count() })
      .from(sageJobs)
      .where(
        and(
          inArray(sageJobs.state, ["pending", "running"]),
          gte(sageJobs.attempts, 3),
        ),
      ),
    db
      .select({
        failed: sql<number>`count(*) filter (where ${sageRuns.state} = 'failed')`,
        providerFailed: sql<number>`count(*) filter (where ${sageRuns.state} = 'failed' and ${sageRuns.provider} is not null)`,
        averageLatencyMs: avg(sageRuns.latencyMs),
        inputTokens: sum(sageRuns.inputTokens),
        outputTokens: sum(sageRuns.outputTokens),
      })
      .from(sageRuns)
      .where(gte(sageRuns.startedAt, recentSince)),
    db
      .select({
        activeLeases: sql<number>`(
          select count(*) from ${llmProviderLeases}
          where ${llmProviderLeases.expiresAt} > ${now}
        )`,
        openCircuits: sql<number>`(
          select count(*) from ${llmProviderCircuits}
          where ${llmProviderCircuits.openedUntil} > ${now}
        )`,
      })
      .from(sql`(select 1) provider_guard_snapshot`),
    db
      .select({
        inputTokens: sum(llmDailyUsage.inputTokens),
        outputTokens: sum(llmDailyUsage.outputTokens),
      })
      .from(llmDailyUsage)
      .where(eq(llmDailyUsage.usageDay, usageDay)),
  ]);
  const counts = Object.fromEntries(
    stateRows.map((row) => [row.state, Number(row.total)]),
  );
  const oldestPendingAgeSeconds = oldestPending?.createdAt
    ? Math.max(
        0,
        Math.floor((now.getTime() - oldestPending.createdAt.getTime()) / 1_000),
      )
    : 0;
  const repeatedRetryJobs = Number(retryRows?.total ?? 0);
  const recentFailedRuns = Number(runRows?.failed ?? 0);
  const recentProviderFailures = Number(runRows?.providerFailed ?? 0);
  const recentAverageLatencyMs = Math.round(
    Number(runRows?.averageLatencyMs ?? 0),
  );
  const recentInputTokens = Number(runRows?.inputTokens ?? 0);
  const recentOutputTokens = Number(runRows?.outputTokens ?? 0);
  const activeProviderLeases = Number(providerRows?.activeLeases ?? 0);
  const openProviderCircuits = Number(providerRows?.openCircuits ?? 0);
  const todayProviderInputTokens = Number(dailyUsageRows?.inputTokens ?? 0);
  const todayProviderOutputTokens = Number(dailyUsageRows?.outputTokens ?? 0);
  const rates = configuredTokenCost();
  const estimatedProviderCostUsd = rates
    ? Number(
        (
          (recentInputTokens * rates.inputPerMillion +
            recentOutputTokens * rates.outputPerMillion) /
          1_000_000
        ).toFixed(6),
      )
    : null;
  const alerts: SageOperationsAlert[] = [];
  if (oldestPendingAgeSeconds >= 15 * 60) {
    alerts.push({
      key: "queue_age",
      severity: oldestPendingAgeSeconds >= 60 * 60 ? "critical" : "warning",
      message: `The oldest pending Sage job is ${Math.floor(oldestPendingAgeSeconds / 60)} minutes old.`,
    });
  }
  if (Number(counts.dead_letter ?? 0) > 0) {
    alerts.push({
      key: "dead_letters",
      severity: "critical",
      message: `${counts.dead_letter} Sage ${counts.dead_letter === 1 ? "job needs" : "jobs need"} dead-letter review.`,
    });
  }
  if (repeatedRetryJobs > 0) {
    alerts.push({
      key: "repeated_retries",
      severity: "warning",
      message: `${repeatedRetryJobs} Sage ${repeatedRetryJobs === 1 ? "job has" : "jobs have"} retried at least three times.`,
    });
  }
  if (recentProviderFailures >= 3) {
    alerts.push({
      key: "provider_failures",
      severity: recentProviderFailures >= 10 ? "critical" : "warning",
      message: `${recentProviderFailures} hosted-model attempts failed in the last 15 minutes.`,
    });
  }
  if (openProviderCircuits > 0) {
    alerts.push({
      key: "provider_circuit",
      severity: "critical",
      message: `${openProviderCircuits} hosted-model ${openProviderCircuits === 1 ? "circuit is" : "circuits are"} open. Requests are being held for recovery.`,
    });
  }
  return {
    generatedAt: now.toISOString(),
    counts,
    oldestPendingAgeSeconds,
    repeatedRetryJobs,
    recentFailedRuns,
    recentProviderFailures,
    recentAverageLatencyMs,
    recentInputTokens,
    recentOutputTokens,
    activeProviderLeases,
    openProviderCircuits,
    todayProviderInputTokens,
    todayProviderOutputTokens,
    estimatedProviderCostUsd,
    alerts,
  };
}

export type PublicSageOperationsJob = {
  id: string;
  capability: string;
  trigger: string;
  state: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  userName: string | null;
  userEmail: string;
  runAt: string;
  createdAt: string;
  updatedAt: string;
};

function toPublicOperationsJob(input: {
  job: typeof sageJobs.$inferSelect;
  userName: string | null;
  userEmail: string;
}): PublicSageOperationsJob {
  const { job, userName, userEmail } = input;
  return {
    id: job.id,
    capability: job.capability,
    trigger: job.trigger,
    state: job.state,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    lastError: job.lastError,
    userName,
    userEmail,
    runAt: job.runAt.toISOString(),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export async function listSageOperationsJobs(
  limit = 100,
): Promise<PublicSageOperationsJob[]> {
  const rows = await getDb()
    .select({
      job: sageJobs,
      userName: users.name,
      userEmail: users.email,
    })
    .from(sageJobs)
    .innerJoin(users, eq(sageJobs.userId, users.id))
    .where(
      inArray(sageJobs.state, [
        ...ACTIVE_STATES,
        ...RECOVERABLE_STATES,
      ]),
    )
    .orderBy(
      asc(sql`case when ${sageJobs.state} = 'dead_letter' then 0 when ${sageJobs.state} = 'failed' then 1 else 2 end`),
      desc(sageJobs.updatedAt),
    )
    .limit(Math.max(1, Math.min(250, Math.floor(limit))));
  return rows.map(toPublicOperationsJob);
}

/** Requeue the same encrypted job and preserve its attempt history. */
export async function requeueSageJob(input: {
  administrator: User;
  jobId: string;
  reason: string;
}): Promise<PublicSageOperationsJob> {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new AgentApiError(400, "A requeue reason between 3 and 500 characters is required");
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(sageJobs)
      .where(eq(sageJobs.id, input.jobId))
      .limit(1)
      .for("update");
    if (!job) throw new AgentApiError(404, "Sage job not found");
    if (!(RECOVERABLE_STATES as readonly string[]).includes(job.state)) {
      throw new AgentApiError(409, "Only failed or dead-letter jobs can be requeued");
    }
    const now = new Date();
    await tx
      .update(sageJobs)
      .set({
        state: "pending",
        runAt: now,
        maxAttempts: Math.max(job.maxAttempts, job.attempts + 3),
        workerId: null,
        leasedAt: null,
        leaseExpiresAt: null,
        result: null,
        resultEncrypted: null,
        lastError: null,
        completedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(sageJobs.id, job.id),
          inArray(sageJobs.state, [...RECOVERABLE_STATES]),
        ),
      );
    await tx.insert(auditLogs).values({
      actorUserId: input.administrator.id,
      actorKind: "user",
      action: "sage.job_requeued",
      entityType: "sage_job",
      entityId: job.id,
      metadata: {
        reason,
        priorState: job.state,
        priorAttempts: job.attempts,
        nextAttempt: job.attempts + 1,
      },
    });
  });
  const [saved] = await db
    .select({
      job: sageJobs,
      userName: users.name,
      userEmail: users.email,
    })
    .from(sageJobs)
    .innerJoin(users, eq(sageJobs.userId, users.id))
    .where(eq(sageJobs.id, input.jobId))
    .limit(1);
  if (!saved) throw new Error("Requeued Sage job was not found");
  return toPublicOperationsJob(saved);
}

export type SageRetentionResult = {
  deletedJobs: number;
  deletedNotifications: number;
  deletedProviderUsage: number;
  deletedProviderLeases: number;
  deletedProviderCircuits: number;
};

export async function cleanupSageOperations(input: {
  now?: Date;
  onlyUserId?: string;
} = {}): Promise<SageRetentionResult> {
  const db = getDb();
  const now = input.now ?? new Date();
  const standardCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60_000);
  const deadLetterCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60_000);
  const sentNotificationCutoff = new Date(
    now.getTime() - 30 * 24 * 60 * 60_000,
  );
  const failedNotificationCutoff = new Date(
    now.getTime() - 90 * 24 * 60 * 60_000,
  );
  const providerUsageDayCutoff = standardCutoff.toISOString().slice(0, 10);
  return db.transaction(async (tx) => {
    const deletedJobs = await tx
      .delete(sageJobs)
      .where(
        and(
          input.onlyUserId ? eq(sageJobs.userId, input.onlyUserId) : undefined,
          or(
            and(
              inArray(sageJobs.state, ["completed", "failed"]),
              isNotNull(sageJobs.completedAt),
              lt(sageJobs.completedAt, standardCutoff),
            ),
            and(
              eq(sageJobs.state, "dead_letter"),
              isNotNull(sageJobs.completedAt),
              lt(sageJobs.completedAt, deadLetterCutoff),
            ),
          ),
        ),
      )
      .returning({ id: sageJobs.id });
    const deletedNotifications = input.onlyUserId
      ? []
      : await tx
          .delete(notificationOutbox)
          .where(
            or(
              and(
                isNotNull(notificationOutbox.sentAt),
                lt(notificationOutbox.sentAt, sentNotificationCutoff),
              ),
              and(
                gte(notificationOutbox.attempts, 5),
                isNotNull(notificationOutbox.failedAt),
                lt(notificationOutbox.failedAt, failedNotificationCutoff),
              ),
            ),
          )
          .returning({ id: notificationOutbox.id });
    const deletedProviderUsage = await tx
      .delete(llmDailyUsage)
      .where(
        and(
          input.onlyUserId
            ? eq(llmDailyUsage.userId, input.onlyUserId)
            : undefined,
          lt(llmDailyUsage.usageDay, providerUsageDayCutoff),
        ),
      )
      .returning({ id: llmDailyUsage.id });
    const deletedProviderLeases = await tx
      .delete(llmProviderLeases)
      .where(
        and(
          input.onlyUserId
            ? eq(llmProviderLeases.userId, input.onlyUserId)
            : undefined,
          lte(llmProviderLeases.expiresAt, now),
        ),
      )
      .returning({ id: llmProviderLeases.id });
    const deletedProviderCircuits = input.onlyUserId
      ? []
      : await tx
          .delete(llmProviderCircuits)
          .where(
            and(
              lt(llmProviderCircuits.updatedAt, standardCutoff),
              or(
                isNull(llmProviderCircuits.openedUntil),
                lte(llmProviderCircuits.openedUntil, now),
              ),
            ),
          )
          .returning({ providerKey: llmProviderCircuits.providerKey });
    if (
      deletedJobs.length > 0 ||
      deletedNotifications.length > 0 ||
      deletedProviderUsage.length > 0 ||
      deletedProviderLeases.length > 0 ||
      deletedProviderCircuits.length > 0
    ) {
      await tx.insert(auditLogs).values({
        actorKind: "system",
        action: "sage.retention_cleanup",
        entityType: "sage_operations",
        entityId: input.onlyUserId ?? null,
        metadata: {
          deletedJobs: deletedJobs.length,
          deletedNotifications: deletedNotifications.length,
          deletedProviderUsage: deletedProviderUsage.length,
          deletedProviderLeases: deletedProviderLeases.length,
          deletedProviderCircuits: deletedProviderCircuits.length,
          scopedUserId: input.onlyUserId ?? null,
        },
      });
    }
    return {
      deletedJobs: deletedJobs.length,
      deletedNotifications: deletedNotifications.length,
      deletedProviderUsage: deletedProviderUsage.length,
      deletedProviderLeases: deletedProviderLeases.length,
      deletedProviderCircuits: deletedProviderCircuits.length,
    };
  });
}

export async function enqueueSageOperationsAlerts(
  snapshot: SageOperationsSnapshot,
  now = new Date(),
): Promise<number> {
  if (snapshot.alerts.length === 0) return 0;
  const emails = (process.env.INTENT_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) return 0;
  const db = getDb();
  const administrators = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(sql`lower(${users.email})`, emails));
  if (administrators.length === 0) return 0;
  const hour = now.toISOString().slice(0, 13);
  const inserted = await db
    .insert(notificationOutbox)
    .values(
      administrators.flatMap((administrator) =>
        snapshot.alerts.map((alert) => ({
          userId: administrator.id,
          channel: "email",
          template: "sage_operations_alert",
          payload: alert,
          dedupeKey: `sage-operations:${alert.key}:${hour}:${administrator.id}`,
        })),
      ),
    )
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
    .returning({ id: notificationOutbox.id });
  return inserted.length;
}
