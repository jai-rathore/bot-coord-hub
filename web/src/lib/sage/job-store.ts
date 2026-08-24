import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  agentOperatorPreferences,
  apiKeys,
  sageJobs,
  sageRuns,
  sageSteps,
  type SageJob,
  type SageRun,
  type User,
} from "@/db/schema";
import { decryptJson, encryptJson } from "@/lib/secret-crypto";

export type SageTrigger =
  | "user_request"
  | "scheduled"
  | "inbox"
  | "deadline"
  | "approval_result";

export type AgentOperatorMode =
  | "sage_primary"
  | "external_primary"
  | "sage_only";

export type ClaimedSageJob = {
  job: SageJob;
  run: SageRun;
};

export function shouldSageHandle(input: {
  mode: AgentOperatorMode;
  trigger: SageTrigger;
  externalAgentConnected: boolean;
}): boolean {
  if (input.trigger === "user_request") return true;
  if (input.mode === "sage_only" || input.mode === "sage_primary") return true;
  return !input.externalAgentConnected;
}

export function sageRetryDelayMs(attempt: number): number {
  const exponent = Math.max(0, Math.min(20, attempt - 1));
  return Math.min(30 * 60_000, 5_000 * 2 ** exponent);
}

export function safeSageError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 2_000);
}

export async function getAgentOperatorMode(
  userId: string,
): Promise<AgentOperatorMode> {
  const db = getDb();
  const [preference] = await db
    .select({ mode: agentOperatorPreferences.mode })
    .from(agentOperatorPreferences)
    .where(eq(agentOperatorPreferences.userId, userId))
    .limit(1);
  return preference?.mode ?? "sage_primary";
}

export async function setAgentOperatorMode(
  userId: string,
  mode: AgentOperatorMode,
) {
  const db = getDb();
  const [row] = await db
    .insert(agentOperatorPreferences)
    .values({ userId, mode, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: agentOperatorPreferences.userId,
      set: { mode, updatedAt: new Date() },
    })
    .returning();
  return row;
}

async function hasConnectedExternalAgent(userId: string): Promise<boolean> {
  const db = getDb();
  const [key] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.userId, userId),
        isNull(apiKeys.revokedAt),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
      ),
    )
    .limit(1);
  return Boolean(key);
}

export async function canEnqueueSageTrigger(
  userId: string,
  trigger: SageTrigger,
): Promise<boolean> {
  if (trigger === "user_request") return true;
  const [mode, externalAgentConnected] = await Promise.all([
    getAgentOperatorMode(userId),
    hasConnectedExternalAgent(userId),
  ]);
  return shouldSageHandle({ mode, trigger, externalAgentConnected });
}

export async function enqueueSageJob(input: {
  user: Pick<User, "id">;
  capability: string;
  trigger: SageTrigger;
  payload: Record<string, unknown>;
  redactedPayload?: Record<string, unknown>;
  idempotencyKey?: string | null;
  runAt?: Date;
  maxAttempts?: number;
}): Promise<{ job: SageJob; created: boolean }> {
  if (!(await canEnqueueSageTrigger(input.user.id, input.trigger))) {
    throw new Error("Sage is not the selected operator for this trigger");
  }

  const db = getDb();
  const values = {
    userId: input.user.id,
    capability: input.capability,
    trigger: input.trigger,
    payload: input.redactedPayload ?? input.payload,
    payloadEncrypted: input.redactedPayload
      ? encryptJson(input.payload)
      : null,
    idempotencyKey: input.idempotencyKey ?? null,
    runAt: input.runAt ?? new Date(),
    maxAttempts: input.maxAttempts ?? 5,
  };

  if (!values.idempotencyKey) {
    const [job] = await db.insert(sageJobs).values(values).returning();
    return { job, created: true };
  }

  const [created] = await db
    .insert(sageJobs)
    .values(values)
    .onConflictDoNothing({
      target: [
        sageJobs.userId,
        sageJobs.capability,
        sageJobs.idempotencyKey,
      ],
      where: sql`${sageJobs.idempotencyKey} is not null`,
    })
    .returning();
  if (created) return { job: created, created: true };

  const [existing] = await db
    .select()
    .from(sageJobs)
    .where(
      and(
        eq(sageJobs.userId, input.user.id),
        eq(sageJobs.capability, input.capability),
        eq(sageJobs.idempotencyKey, values.idempotencyKey),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new Error("The Sage job could not be enqueued idempotently");
  }
  return { job: existing, created: false };
}

/** Decrypt the private execution input, while supporting jobs queued before encryption. */
export function executionPayloadForSageJob(job: SageJob): Record<string, unknown> {
  return job.payloadEncrypted ? decryptJson(job.payloadEncrypted) : job.payload;
}

/** Decrypt an owner-visible result, while supporting jobs completed before encryption. */
export function ownerResultForSageJob(job: SageJob): Record<string, unknown> | null {
  return job.resultEncrypted ? decryptJson(job.resultEncrypted) : job.result;
}

export async function listSageJobsForUser(userId: string, limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return getDb()
    .select()
    .from(sageJobs)
    .where(eq(sageJobs.userId, userId))
    .orderBy(desc(sageJobs.createdAt))
    .limit(safeLimit);
}

export async function claimNextSageJob(input: {
  workerId: string;
  leaseMs: number;
}): Promise<ClaimedSageJob | null> {
  const db = getDb();
  const now = new Date();
  const nowSql = now.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + input.leaseMs);

  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(sageJobs)
      .where(
        and(
          sql`${sageJobs.attempts} < ${sageJobs.maxAttempts}`,
          sql`not exists (
            select 1
            from sage_jobs active_sage_job
            where active_sage_job.user_id = ${sageJobs.userId}
              and active_sage_job.capability = ${sageJobs.capability}
              and active_sage_job.id <> ${sageJobs.id}
              and active_sage_job.state = 'running'
              and active_sage_job.lease_expires_at > ${nowSql}
          )`,
          or(
            and(eq(sageJobs.state, "pending"), lte(sageJobs.runAt, now)),
            and(
              eq(sageJobs.state, "running"),
              lte(sageJobs.leaseExpiresAt, now),
            ),
          ),
        ),
      )
      .orderBy(asc(sageJobs.runAt), asc(sageJobs.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!candidate) return null;

    const lockRows = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(
        hashtext(${`sage:${candidate.userId}:${candidate.capability}`})
      ) as locked`,
    );
    if (!lockRows[0]?.locked) return null;

    const [activeForUser] = await tx
      .select({ id: sageJobs.id })
      .from(sageJobs)
      .where(
        and(
          eq(sageJobs.userId, candidate.userId),
          eq(sageJobs.capability, candidate.capability),
          ne(sageJobs.id, candidate.id),
          eq(sageJobs.state, "running"),
          gt(sageJobs.leaseExpiresAt, now),
        ),
      )
      .limit(1);
    if (activeForUser) return null;

    const nextAttempt = candidate.attempts + 1;
    const staleRuns = await tx
      .update(sageRuns)
      .set({
        state: "failed",
        error: "Worker lease expired before the attempt completed",
        finishedAt: now,
      })
      .where(
        and(
          eq(sageRuns.jobId, candidate.id),
          eq(sageRuns.state, "running"),
        ),
      )
      .returning({ id: sageRuns.id });
    if (staleRuns.length) {
      await tx
        .update(sageSteps)
        .set({
          state: "failed",
          error: "Worker lease expired before the step completed",
          finishedAt: now,
        })
        .where(
          and(
            inArray(
              sageSteps.runId,
              staleRuns.map((run) => run.id),
            ),
            eq(sageSteps.state, "running"),
          ),
        );
    }
    const [job] = await tx
      .update(sageJobs)
      .set({
        state: "running",
        attempts: nextAttempt,
        workerId: input.workerId,
        leasedAt: now,
        leaseExpiresAt,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(sageJobs.id, candidate.id))
      .returning();
    const [run] = await tx
      .insert(sageRuns)
      .values({ jobId: job.id, attempt: nextAttempt, state: "running" })
      .returning();
    return { job, run };
  });
}

export async function extendSageJobLease(input: {
  jobId: string;
  workerId: string;
  leaseMs: number;
}) {
  const now = new Date();
  await getDb()
    .update(sageJobs)
    .set({
      leaseExpiresAt: new Date(now.getTime() + input.leaseMs),
      updatedAt: now,
    })
    .where(
      and(
        eq(sageJobs.id, input.jobId),
        eq(sageJobs.workerId, input.workerId),
        eq(sageJobs.state, "running"),
      ),
    );
}

export async function startSageStep(input: {
  runId: string;
  capability: string;
  redactedInput: Record<string, unknown>;
}) {
  const [step] = await getDb()
    .insert(sageSteps)
    .values({
      runId: input.runId,
      sequence: 1,
      capability: input.capability,
      state: "running",
      input: input.redactedInput,
    })
    .returning();
  return step;
}

export async function completeSageStep(
  stepId: string,
  output: Record<string, unknown>,
) {
  await getDb()
    .update(sageSteps)
    .set({ state: "completed", output, finishedAt: new Date() })
    .where(eq(sageSteps.id, stepId));
}

export async function recordSageRunTelemetry(
  runId: string,
  telemetry: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  },
) {
  await getDb()
    .update(sageRuns)
    .set({
      provider: telemetry.provider.slice(0, 120),
      model: telemetry.model.slice(0, 160),
      inputTokens: Math.max(0, Math.floor(telemetry.inputTokens)),
      outputTokens: Math.max(0, Math.floor(telemetry.outputTokens)),
    })
    .where(eq(sageRuns.id, runId));
}

export async function failSageStep(stepId: string, error: unknown) {
  await getDb()
    .update(sageSteps)
    .set({
      state: "failed",
      error: safeSageError(error),
      finishedAt: new Date(),
    })
    .where(eq(sageSteps.id, stepId));
}

export async function finishSageJob(input: {
  job: SageJob;
  run: SageRun;
  state: "waiting_human" | "completed";
  result: Record<string, unknown>;
  redactedResult: Record<string, unknown>;
  startedAtMs: number;
}) {
  const db = getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(sageRuns)
      .set({
        state: "completed",
        latencyMs: Math.max(0, Date.now() - input.startedAtMs),
        finishedAt: now,
      })
      .where(eq(sageRuns.id, input.run.id));
    await tx
      .update(sageJobs)
      .set({
        state: input.state,
        result: input.redactedResult,
        resultEncrypted: encryptJson(input.result),
        workerId: null,
        leasedAt: null,
        leaseExpiresAt: null,
        completedAt: input.state === "completed" ? now : null,
        updatedAt: now,
      })
      .where(eq(sageJobs.id, input.job.id));
  });
}

export async function failSageJob(input: {
  job: SageJob;
  run: SageRun;
  error: unknown;
  retryable: boolean;
  startedAtMs: number;
}) {
  const db = getDb();
  const now = new Date();
  const error = safeSageError(input.error);
  const exhausted = input.job.attempts >= input.job.maxAttempts;
  const retry = input.retryable && !exhausted;

  await db.transaction(async (tx) => {
    await tx
      .update(sageRuns)
      .set({
        state: "failed",
        error,
        latencyMs: Math.max(0, Date.now() - input.startedAtMs),
        finishedAt: now,
      })
      .where(eq(sageRuns.id, input.run.id));
    await tx
      .update(sageJobs)
      .set({
        state: retry ? "pending" : exhausted ? "dead_letter" : "failed",
        runAt: retry
          ? new Date(now.getTime() + sageRetryDelayMs(input.job.attempts))
          : input.job.runAt,
        workerId: null,
        leasedAt: null,
        leaseExpiresAt: null,
        lastError: error,
        completedAt: retry ? null : now,
        updatedAt: now,
      })
      .where(eq(sageJobs.id, input.job.id));
  });
}

export async function completeWaitingSageScheduleJobs(
  sessionId: string,
  result: Record<string, unknown>,
) {
  const now = new Date();
  return getDb()
    .update(sageJobs)
    .set({
      state: "completed",
      result,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(sageJobs.capability, "schedule_meeting"),
        eq(sageJobs.state, "waiting_human"),
        sql`${sageJobs.result}->>'sessionId' = ${sessionId}`,
      ),
    )
    .returning({ id: sageJobs.id });
}
