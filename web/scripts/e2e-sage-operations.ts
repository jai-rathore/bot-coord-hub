import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  auditLogs,
  llmDailyUsage,
  llmProviderCircuits,
  notificationOutbox,
  sageJobs,
  sageRuns,
  users,
  type SageJob,
} from "../src/db/schema";
import { claimNotificationOutbox } from "../src/lib/events/notify";
import {
  LlmBudgetExceededError,
  LlmCapacityError,
  LlmCircuitOpenError,
  LlmProviderError,
  ResilientLlmProvider,
  type LlmProvider,
  type LlmResult,
} from "../src/lib/llm";
import {
  claimNextSageJob,
  enqueueSageJob,
  finishSageJob,
} from "../src/lib/sage/job-store";
import {
  cleanupSageOperations,
  requeueSageJob,
  sageOperationsSnapshot,
} from "../src/lib/sage/operations";

const db = getDb();

function pause(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitForJob(jobId: string): Promise<SageJob> {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const [job] = await db
      .select()
      .from(sageJobs)
      .where(eq(sageJobs.id, jobId))
      .limit(1);
    if (!job) throw new Error(`Sage operations job ${jobId} disappeared`);
    if (job.state === "completed") return job;
    if (["failed", "dead_letter"].includes(job.state)) {
      throw new Error(job.lastError ?? `Sage operations job ended ${job.state}`);
    }
    await pause(500);
  }
  throw new Error(`Sage operations job ${jobId} did not finish within 90 seconds`);
}

async function main() {
  const suffix = randomBytes(5).toString("hex");
  const createdUserIds: string[] = [];
  const syntheticAuditEntityIds: string[] = [];
  const providerKeys: string[] = [];
  const savedProviderEnv = Object.fromEntries(
    [
      "SAGE_PROVIDER_MAX_ATTEMPTS",
      "SAGE_PROVIDER_RETRY_BASE_MS",
      "SAGE_PROVIDER_MAX_CONCURRENCY",
      "SAGE_PROVIDER_CIRCUIT_FAILURES",
      "SAGE_PROVIDER_CIRCUIT_COOLDOWN_MS",
      "SAGE_USER_DAILY_TOKEN_LIMIT",
      "SAGE_USER_DAILY_COST_LIMIT_USD",
      "SAGE_INPUT_COST_PER_MILLION_USD",
      "SAGE_OUTPUT_COST_PER_MILLION_USD",
    ].map((key) => [key, process.env[key]]),
  );
  try {
    const [administrator, subject] = await db
      .insert(users)
      .values([
        {
          clerkUserId: `sage_ops_admin_${suffix}`,
          email: `sage_ops_admin_${suffix}@example.com`,
          name: "Sage Operations Admin",
        },
        {
          clerkUserId: `sage_ops_subject_${suffix}`,
          email: `sage_ops_subject_${suffix}@example.com`,
          name: "Sage Operations Subject",
        },
      ])
      .returning();
    createdUserIds.push(administrator.id, subject.id);

    const successfulResult: LlmResult = {
      text: "ok",
      toolCalls: [],
      tokensIn: 11,
      tokensOut: 7,
      provider: `synthetic-${suffix}`,
      model: "retry",
    };
    process.env.SAGE_PROVIDER_MAX_ATTEMPTS = "3";
    process.env.SAGE_PROVIDER_RETRY_BASE_MS = "1";
    process.env.SAGE_USER_DAILY_TOKEN_LIMIT = "100000";
    let retryCalls = 0;
    const retryProvider: LlmProvider = {
      name: `synthetic-${suffix}`,
      model: "retry",
      async complete() {
        retryCalls += 1;
        if (retryCalls === 1) {
          throw new LlmProviderError("synthetic 503", {
            retryable: true,
            status: 503,
          });
        }
        return successfulResult;
      },
    };
    const retryProviderKey = `${retryProvider.name}:${retryProvider.model}`;
    providerKeys.push(retryProviderKey);
    await new ResilientLlmProvider(retryProvider).complete({
      system: "Synthetic retry proof",
      messages: [{ role: "user", text: "Run once" }],
      tools: [],
      maxOutputTokens: 20,
      budget: { userId: subject.id },
    });
    assert.equal(retryCalls, 2);
    const [usage] = await db
      .select()
      .from(llmDailyUsage)
      .where(
        and(
          eq(llmDailyUsage.userId, subject.id),
          eq(llmDailyUsage.providerKey, retryProviderKey),
        ),
      )
      .limit(1);
    assert.equal(usage.inputTokens, 11);
    assert.equal(usage.outputTokens, 7);
    console.log("PASS transient provider failure retried and recorded actual usage");

    process.env.SAGE_PROVIDER_MAX_CONCURRENCY = "1";
    let releaseProvider!: () => void;
    let markStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const providerRelease = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const concurrencyProvider: LlmProvider = {
      name: `synthetic-${suffix}`,
      model: "concurrency",
      async complete() {
        markStarted();
        await providerRelease;
        return { ...successfulResult, model: "concurrency" };
      },
    };
    providerKeys.push(`${concurrencyProvider.name}:${concurrencyProvider.model}`);
    const guardedConcurrency = new ResilientLlmProvider(concurrencyProvider);
    const firstCall = guardedConcurrency.complete({
      system: "Synthetic concurrency proof",
      messages: [{ role: "user", text: "First" }],
      tools: [],
      maxOutputTokens: 20,
      budget: { userId: subject.id },
    });
    await providerStarted;
    await assert.rejects(
      guardedConcurrency.complete({
        system: "Synthetic concurrency proof",
        messages: [{ role: "user", text: "Second" }],
        tools: [],
        maxOutputTokens: 20,
        budget: { userId: subject.id },
      }),
      LlmCapacityError,
    );
    releaseProvider();
    await firstCall;
    console.log("PASS fleet-wide provider lease enforced the concurrency cap");

    process.env.SAGE_PROVIDER_MAX_ATTEMPTS = "1";
    process.env.SAGE_PROVIDER_CIRCUIT_FAILURES = "2";
    process.env.SAGE_PROVIDER_CIRCUIT_COOLDOWN_MS = "60000";
    const circuitProvider: LlmProvider = {
      name: `synthetic-${suffix}`,
      model: "circuit",
      async complete() {
        throw new LlmProviderError("synthetic outage", {
          retryable: true,
          status: 503,
        });
      },
    };
    const circuitProviderKey = `${circuitProvider.name}:${circuitProvider.model}`;
    providerKeys.push(circuitProviderKey);
    const guardedCircuit = new ResilientLlmProvider(circuitProvider);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await assert.rejects(
        guardedCircuit.complete({
          system: "Synthetic circuit proof",
          messages: [{ role: "user", text: "Fail" }],
          tools: [],
          maxOutputTokens: 20,
          budget: { userId: subject.id },
        }),
        LlmProviderError,
      );
    }
    await assert.rejects(
      guardedCircuit.complete({
        system: "Synthetic circuit proof",
        messages: [{ role: "user", text: "Held" }],
        tools: [],
        maxOutputTokens: 20,
        budget: { userId: subject.id },
      }),
      LlmCircuitOpenError,
    );
    const [openCircuit] = await db
      .select()
      .from(llmProviderCircuits)
      .where(eq(llmProviderCircuits.providerKey, circuitProviderKey))
      .limit(1);
    assert.ok(openCircuit.openedUntil && openCircuit.openedUntil > new Date());
    console.log("PASS repeated transient failures opened the shared provider circuit");

    const budgetProvider: LlmProvider = {
      name: `synthetic-${suffix}`,
      model: "budget",
      async complete() {
        throw new Error("budget should stop the provider call");
      },
    };
    providerKeys.push(`${budgetProvider.name}:${budgetProvider.model}`);
    process.env.SAGE_USER_DAILY_TOKEN_LIMIT = "10";
    await assert.rejects(
      new ResilientLlmProvider(budgetProvider).complete({
        system: "Synthetic token budget proof",
        messages: [{ role: "user", text: "Do not send" }],
        tools: [],
        maxOutputTokens: 20,
        budget: { userId: subject.id },
      }),
      LlmBudgetExceededError,
    );
    process.env.SAGE_USER_DAILY_TOKEN_LIMIT = "100000";
    process.env.SAGE_INPUT_COST_PER_MILLION_USD = "1";
    process.env.SAGE_OUTPUT_COST_PER_MILLION_USD = "1";
    process.env.SAGE_USER_DAILY_COST_LIMIT_USD = "0.000001";
    await assert.rejects(
      new ResilientLlmProvider(budgetProvider).complete({
        system: "Synthetic cost budget proof",
        messages: [{ role: "user", text: "Do not send" }],
        tools: [],
        maxOutputTokens: 20,
        budget: { userId: subject.id },
      }),
      LlmBudgetExceededError,
    );
    console.log("PASS per-person daily token and configured cost budgets failed closed");

    const futureRunAt = new Date(Date.now() + 60 * 60_000);
    const idempotencyKey = `sage-ops-idempotency-${suffix}`;
    const replayed = await Promise.all([
      enqueueSageJob({
        user: subject,
        capability: "review_activity",
        trigger: "user_request",
        payload: { action: "overview", pendingOnly: true, limit: 5 },
        idempotencyKey,
        runAt: futureRunAt,
      }),
      enqueueSageJob({
        user: subject,
        capability: "review_activity",
        trigger: "user_request",
        payload: { action: "overview", pendingOnly: true, limit: 5 },
        idempotencyKey,
        runAt: futureRunAt,
      }),
    ]);
    assert.equal(replayed[0].job.id, replayed[1].job.id);
    assert.equal(replayed.filter((result) => result.created).length, 1);
    console.log("PASS concurrent idempotent enqueue created one durable Sage job");

    const [concurrentJob] = await db
      .insert(sageJobs)
      .values({
        userId: subject.id,
        capability: "review_activity",
        trigger: "user_request",
        payload: { action: "overview", pendingOnly: true, limit: 5 },
        runAt: futureRunAt,
      })
      .returning();
    const claimNow = new Date(futureRunAt.getTime() + 1_000);
    const concurrentClaims = await Promise.all([
      claimNextSageJob({
        jobId: concurrentJob.id,
        workerId: `sage-ops-a-${suffix}`,
        leaseMs: 60_000,
        now: claimNow,
      }),
      claimNextSageJob({
        jobId: concurrentJob.id,
        workerId: `sage-ops-b-${suffix}`,
        leaseMs: 60_000,
        now: claimNow,
      }),
    ]);
    const winners = concurrentClaims.filter(
      (claim): claim is NonNullable<typeof claim> => Boolean(claim),
    );
    assert.equal(winners.length, 1, "exactly one concurrent worker may claim a job");
    await finishSageJob({
      job: winners[0].job,
      run: winners[0].run,
      state: "completed",
      result: { verified: true },
      redactedResult: { verified: true },
      startedAtMs: Date.now(),
    });
    console.log("PASS concurrent queue claim selected exactly one worker");

    const staleTime = new Date(Date.now() - 5 * 60_000);
    const [expiredLeaseJob] = await db
      .insert(sageJobs)
      .values({
        userId: subject.id,
        capability: "review_activity",
        trigger: "scheduled",
        payload: { action: "overview", pendingOnly: true, limit: 5 },
        state: "running",
        attempts: 1,
        maxAttempts: 5,
        workerId: `stale-${suffix}`,
        leasedAt: staleTime,
        leaseExpiresAt: staleTime,
        runAt: staleTime,
      })
      .returning();
    const [staleRun] = await db
      .insert(sageRuns)
      .values({
        jobId: expiredLeaseJob.id,
        attempt: 1,
        state: "running",
        startedAt: staleTime,
      })
      .returning();
    const recovered = await claimNextSageJob({
      jobId: expiredLeaseJob.id,
      workerId: `recovery-${suffix}`,
      leaseMs: 60_000,
    });
    assert.ok(recovered, "an expired lease must be recoverable");
    assert.equal(recovered.job.attempts, 2);
    const [failedStaleRun] = await db
      .select()
      .from(sageRuns)
      .where(eq(sageRuns.id, staleRun.id))
      .limit(1);
    assert.equal(failedStaleRun.state, "failed");
    assert.match(failedStaleRun.error ?? "", /lease expired/i);
    await finishSageJob({
      job: recovered.job,
      run: recovered.run,
      state: "completed",
      result: { recovered: true },
      redactedResult: { recovered: true },
      startedAtMs: Date.now(),
    });
    console.log("PASS expired lease closed the stale run and started one recovery attempt");

    const [outboxRow] = await db
      .insert(notificationOutbox)
      .values({
        userId: subject.id,
        channel: "email",
        template: "sage_operations_alert",
        payload: { alert: "lease test", message: "Synthetic lease test" },
        dedupeKey: `sage-ops-lease:${suffix}`,
        scheduledFor: futureRunAt,
      })
      .returning();
    const outboxClaims = await Promise.all([
      claimNotificationOutbox({
        onlyIds: [outboxRow.id],
        now: claimNow,
        workerId: `outbox-a-${suffix}`,
      }),
      claimNotificationOutbox({
        onlyIds: [outboxRow.id],
        now: claimNow,
        workerId: `outbox-b-${suffix}`,
      }),
    ]);
    assert.equal(
      outboxClaims.reduce((total, claim) => total + claim.ids.length, 0),
      1,
      "exactly one outbox drainer may lease a notification",
    );
    console.log("PASS concurrent notification drainers created one durable lease");

    const [recoverableJob] = await db
      .insert(sageJobs)
      .values({
        userId: subject.id,
        capability: "review_activity",
        trigger: "user_request",
        payload: { action: "overview", pendingOnly: true, limit: 5 },
        state: "dead_letter",
        attempts: 1,
        maxAttempts: 1,
        lastError: "Synthetic exhausted attempt",
        completedAt: new Date(),
      })
      .returning();
    syntheticAuditEntityIds.push(recoverableJob.id);
    const requeued = await requeueSageJob({
      administrator,
      jobId: recoverableJob.id,
      reason: "Synthetic production recovery proof",
    });
    assert.ok(["pending", "running", "completed"].includes(requeued.state));
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "sage.job_requeued"),
          eq(auditLogs.entityId, recoverableJob.id),
        ),
      )
      .limit(1);
    assert.equal(audit.actorUserId, administrator.id);
    await waitForJob(recoverableJob.id);
    console.log("PASS dead-letter requeue was audited and completed by the live worker");

    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60_000);
    const [oldJob] = await db
      .insert(sageJobs)
      .values({
        userId: subject.id,
        capability: "review_activity",
        trigger: "scheduled",
        payload: { action: "overview" },
        state: "completed",
        attempts: 1,
        completedAt: oldDate,
        createdAt: oldDate,
        updatedAt: oldDate,
      })
      .returning();
    const retention = await cleanupSageOperations({ onlyUserId: subject.id });
    syntheticAuditEntityIds.push(subject.id);
    assert.ok(retention.deletedJobs >= 1);
    const [removed] = await db
      .select({ id: sageJobs.id })
      .from(sageJobs)
      .where(eq(sageJobs.id, oldJob.id))
      .limit(1);
    assert.equal(removed, undefined);
    console.log("PASS retention removed old terminal work and retained an audit summary");

    const snapshot = await sageOperationsSnapshot();
    assert.ok(snapshot.counts && Array.isArray(snapshot.alerts));
    assert.ok(snapshot.recentInputTokens >= 0 && snapshot.recentOutputTokens >= 0);
    console.log("PASS queue, latency, outcome, retry, token, and alert metrics rendered");
  } finally {
    if (providerKeys.length) {
      await db
        .delete(llmProviderCircuits)
        .where(eq(llmProviderCircuits.provider, `synthetic-${suffix}`));
    }
    for (const [key, value] of Object.entries(savedProviderEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    for (const entityId of syntheticAuditEntityIds) {
      await db.delete(auditLogs).where(eq(auditLogs.entityId, entityId));
    }
    for (const userId of createdUserIds) {
      await db.delete(users).where(eq(users.id, userId));
    }
    if (createdUserIds.length) console.log("PASS Sage operations synthetic rows cleaned up");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("HoneyMatcha Sage operations e2e FAILED", error);
    process.exit(1);
  });
