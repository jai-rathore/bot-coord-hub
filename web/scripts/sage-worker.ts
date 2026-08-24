import "dotenv/config";
import { randomUUID } from "node:crypto";
import { closeDb } from "../src/db";
import {
  drainNotificationOutbox,
  emailConfigured,
  smsConfigured,
} from "../src/lib/events/notify";
import { processNextSageJob } from "../src/lib/sage/worker";
import { sageJobsFeatureEnabled } from "../src/lib/sage-feature";
import { dispatchDueDiscoveryCadences } from "../src/lib/sage/discovery-cadence";

const workerId = `${process.env.RENDER_INSTANCE_ID ?? "local"}:${process.pid}:${randomUUID().slice(0, 8)}`;
const pollMs = Math.max(250, Number(process.env.SAGE_WORKER_POLL_MS ?? 1_500));
const leaseMs = Math.max(30_000, Number(process.env.SAGE_WORKER_LEASE_MS ?? 120_000));
const heartbeatMs = Math.max(
  1_000,
  Number(process.env.SAGE_WORKER_HEARTBEAT_MS ?? Math.floor(leaseMs / 3)),
);
const cadencePollMs = Math.max(
  60_000,
  Number(process.env.SAGE_CADENCE_POLL_MS ?? 60_000),
);
const notificationPollMs = Math.max(
  1_000,
  Number(process.env.SAGE_NOTIFICATION_POLL_MS ?? 5_000),
);
const notificationBatchSize = Math.max(
  1,
  Math.min(100, Number(process.env.SAGE_NOTIFICATION_BATCH_SIZE ?? 25)),
);
let accepting = true;
let lastCadencePollAt = 0;
let activeJobId: string | null = null;

function stopAccepting(signal: string) {
  if (!accepting) return;
  accepting = false;
  console.log(
    activeJobId
      ? `[sage-worker] ${signal} received; draining job=${activeJobId}`
      : `[sage-worker] ${signal} received; no active job`,
  );
}

process.on("SIGTERM", () => stopAccepting("SIGTERM"));
process.on("SIGINT", () => stopAccepting("SIGINT"));

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function runNotificationLoop() {
  const notificationWorkerId = `sage-outbox:${workerId}`;
  while (accepting) {
    if (emailConfigured() || smsConfigured()) {
      try {
        const result = await drainNotificationOutbox(
          notificationBatchSize,
          new Date(),
          notificationWorkerId,
        );
        if (result.claimed > 0) {
          console.log(
            `[sage-worker] outbox claimed=${result.claimed} sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`,
          );
        }
      } catch (error) {
        console.error("[sage-worker] notification drain failed", error);
      }
    }
    if (accepting) await wait(notificationPollMs);
  }
}

async function main() {
  console.log(`[sage-worker] started ${workerId}`);
  const notificationLoop = runNotificationLoop();
  while (accepting) {
    if (!sageJobsFeatureEnabled()) {
      await wait(30_000);
      continue;
    }
    if (Date.now() - lastCadencePollAt >= cadencePollMs) {
      lastCadencePollAt = Date.now();
      try {
        const dispatched = await dispatchDueDiscoveryCadences();
        if (dispatched.scanned > 0) {
          console.log(
            `[sage-worker] discovery-cadence scanned=${dispatched.scanned} sage=${dispatched.sageQueued} external=${dispatched.externalNotified} deferred=${dispatched.budgetDeferred} ineligible=${dispatched.ineligible} failed=${dispatched.failed}`,
          );
        }
      } catch (error) {
        console.error("[sage-worker] discovery cadence poll failed", error);
      }
    }
    const result = await processNextSageJob({
      workerId,
      leaseMs,
      heartbeatMs,
      onClaim(jobId) {
        activeJobId = jobId;
      },
      onSettled(jobId) {
        if (activeJobId === jobId) activeJobId = null;
      },
    });
    if (result.processed) {
      console.log(
        `[sage-worker] job=${result.jobId} state=${result.state}`,
      );
    }
    if (!result.processed && accepting) await wait(pollMs);
  }
  await notificationLoop;
  await closeDb();
  console.log(`[sage-worker] stopped ${workerId}`);
}

main().catch(async (error) => {
  console.error("[sage-worker] fatal", error);
  await closeDb().catch(() => undefined);
  process.exitCode = 1;
});
