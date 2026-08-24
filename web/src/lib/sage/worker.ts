import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { hostedAgentActor } from "@/lib/actor";
import { writeAudit } from "@/lib/audit";
import { LlmBudgetExceededError } from "@/lib/llm";
import {
  getSageCapability,
  SageCapabilityError,
} from "@/lib/sage/capabilities";
import {
  claimNextSageJob,
  completeSageStep,
  executionPayloadForSageJob,
  extendSageJobLease,
  failSageJob,
  failSageStep,
  finishSageJob,
  recordSageRunProvider,
  recordSageRunTelemetry,
  safeSageError,
  startSageStep,
} from "@/lib/sage/job-store";

export type ProcessSageJobResult =
  | { processed: false }
  | {
      processed: true;
      jobId: string;
      state:
        | "waiting_human"
        | "completed"
        | "pending"
        | "failed"
        | "dead_letter";
    };

export async function processNextSageJob(input: {
  workerId: string;
  leaseMs?: number;
  heartbeatMs?: number;
  onClaim?: (jobId: string) => void;
  onSettled?: (jobId: string) => void;
}): Promise<ProcessSageJobResult> {
  const leaseMs = Math.max(30_000, input.leaseMs ?? 120_000);
  const claimed = await claimNextSageJob({
    workerId: input.workerId,
    leaseMs,
  });
  if (!claimed) return { processed: false };

  const { job, run } = claimed;
  input.onClaim?.(job.id);
  const startedAtMs = Date.now();
  let stepId: string | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  try {
    const [user] = await getDb()
      .select()
      .from(users)
      .where(eq(users.id, job.userId))
      .limit(1);
    if (!user) throw new SageCapabilityError("Sage job owner no longer exists");

    const capability = getSageCapability(job.capability);
    const parsedInput = capability.parseInput(executionPayloadForSageJob(job));
    const step = await startSageStep({
      runId: run.id,
      capability: capability.name,
      redactedInput: capability.redactInput(parsedInput),
    });
    stepId = step.id;

    await writeAudit({
      actorUserId: user.id,
      actorKind: "hosted_agent",
      action: "sage.run.started",
      entityType: "sage_job",
      entityId: job.id,
      metadata: { runId: run.id, capability: capability.name },
    });

    heartbeat = setInterval(() => {
      void extendSageJobLease({
        jobId: job.id,
        workerId: input.workerId,
        leaseMs,
      })
        .then((extended) => {
          console.log(
            `[sage-worker] heartbeat job=${job.id} extended=${extended}`,
          );
        })
        .catch((error) => {
          console.error("[sage-worker] lease heartbeat failed", job.id, error);
        });
    },
    Math.max(
      1_000,
      Math.min(
        Math.floor(leaseMs / 2),
        input.heartbeatMs ?? Math.floor(leaseMs / 3),
      ),
    ));
    heartbeat.unref?.();

    if (["discovery_intake", "event_chat"].includes(capability.name)) {
      await recordSageRunProvider(
        run.id,
        process.env.HOSTED_AGENT_PROVIDER?.trim() || "gemini",
        process.env.HOSTED_AGENT_MODEL?.trim() || "configured-default",
      );
    }

    const outcome = await capability.execute(
      {
        actor: hostedAgentActor(user, run.id),
        jobId: job.id,
        trigger: job.trigger as
          | "user_request"
          | "scheduled"
          | "inbox"
          | "deadline"
          | "approval_result",
      },
      parsedInput,
    );
    if (outcome.telemetry) {
      await recordSageRunTelemetry(run.id, outcome.telemetry);
    }
    const redactedResult = capability.redactOutput(outcome.result);
    await completeSageStep(step.id, redactedResult);
    await finishSageJob({
      job,
      run,
      state: outcome.state,
      result: outcome.result,
      redactedResult,
      startedAtMs,
    });
    await writeAudit({
      actorUserId: user.id,
      actorKind: "hosted_agent",
      action: `sage.run.${outcome.state}`,
      entityType: "sage_job",
      entityId: job.id,
      metadata: {
        runId: run.id,
        capability: capability.name,
        sessionId: outcome.result.sessionId ?? null,
      },
    });
    return { processed: true, jobId: job.id, state: outcome.state };
  } catch (error) {
    if (stepId) await failSageStep(stepId, error);
    const retryable =
      error instanceof SageCapabilityError
        ? error.retryable
        : !(error instanceof LlmBudgetExceededError);
    await failSageJob({ job, run, error, retryable, startedAtMs });
    const state = retryable
      ? job.attempts >= job.maxAttempts
        ? "dead_letter"
        : "pending"
      : "failed";
    await writeAudit({
      actorUserId: job.userId,
      actorKind: "hosted_agent",
      action: "sage.run.failed",
      entityType: "sage_job",
      entityId: job.id,
      metadata: {
        runId: run.id,
        capability: job.capability,
        retryable,
        state,
        error: safeSageError(error),
      },
    });
    return { processed: true, jobId: job.id, state };
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    input.onSettled?.(job.id);
  }
}
