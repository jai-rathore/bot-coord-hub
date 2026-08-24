import "dotenv/config";
import { randomUUID } from "node:crypto";
import { closeDb } from "../src/db";
import { processNextSageJob } from "../src/lib/sage/worker";
import { sageJobsFeatureEnabled } from "../src/lib/sage-feature";
import { dispatchDueDiscoveryCadences } from "../src/lib/sage/discovery-cadence";

const workerId = `${process.env.RENDER_INSTANCE_ID ?? "local"}:${process.pid}:${randomUUID().slice(0, 8)}`;
const pollMs = Math.max(250, Number(process.env.SAGE_WORKER_POLL_MS ?? 1_500));
const leaseMs = Math.max(30_000, Number(process.env.SAGE_WORKER_LEASE_MS ?? 120_000));
const cadencePollMs = Math.max(
  60_000,
  Number(process.env.SAGE_CADENCE_POLL_MS ?? 60_000),
);
let accepting = true;
let lastCadencePollAt = 0;

function stopAccepting(signal: string) {
  if (!accepting) return;
  accepting = false;
  console.log(`[sage-worker] ${signal} received; draining current job`);
}

process.on("SIGTERM", () => stopAccepting("SIGTERM"));
process.on("SIGINT", () => stopAccepting("SIGINT"));

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`[sage-worker] started ${workerId}`);
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
    const result = await processNextSageJob({ workerId, leaseMs });
    if (result.processed) {
      console.log(
        `[sage-worker] job=${result.jobId} state=${result.state}`,
      );
    }
    if (!result.processed && accepting) await wait(pollMs);
  }
  await closeDb();
  console.log(`[sage-worker] stopped ${workerId}`);
}

main().catch(async (error) => {
  console.error("[sage-worker] fatal", error);
  await closeDb().catch(() => undefined);
  process.exitCode = 1;
});
