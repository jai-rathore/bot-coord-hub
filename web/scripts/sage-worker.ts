import "dotenv/config";
import { randomUUID } from "node:crypto";
import { closeDb } from "../src/db";
import { processNextSageJob } from "../src/lib/sage/worker";
import { sageJobsFeatureEnabled } from "../src/lib/sage-feature";

const workerId = `${process.env.RENDER_INSTANCE_ID ?? "local"}:${process.pid}:${randomUUID().slice(0, 8)}`;
const pollMs = Math.max(250, Number(process.env.SAGE_WORKER_POLL_MS ?? 1_500));
const leaseMs = Math.max(30_000, Number(process.env.SAGE_WORKER_LEASE_MS ?? 120_000));
let accepting = true;

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
