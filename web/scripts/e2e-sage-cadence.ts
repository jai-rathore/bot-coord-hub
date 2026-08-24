import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  discoveryCadences,
  discoveryRecommendations,
  sageJobs,
  users,
  type SageJob,
} from "../src/db/schema";
import {
  listDiscoveryRecommendations,
  submitDiscoveryEnrollment,
} from "../src/lib/discovery-service";
import {
  dispatchDueDiscoveryCadences,
  setDiscoveryCadence,
} from "../src/lib/sage/discovery-cadence";
import { ownerResultForSageJob } from "../src/lib/sage/job-store";
import { issueLocationResolutionToken } from "../src/lib/location-resolver";

const db = getDb();

function pause(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function resolvedNeighborhood(userId: string, suffix: string) {
  return {
    resolutionToken: issueLocationResolutionToken(userId, {
      schemaVersion: 1,
      canonicalKey: `synthetic:neighborhood:${suffix}`,
      provider: "geoapify",
      providerPlaceId: `sage-cadence-${suffix}`,
      granularity: "neighborhood",
      label: "Park Slope, Brooklyn, New York, United States",
      countryCode: "US",
      country: "United States",
      regionCode: "US-NY",
      region: "New York",
      locality: "Brooklyn",
      neighborhood: "Park Slope",
    }),
    visibility: "private_match" as const,
  };
}

async function waitForJob(jobId: string): Promise<SageJob> {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const [job] = await db
      .select()
      .from(sageJobs)
      .where(eq(sageJobs.id, jobId))
      .limit(1);
    if (!job) throw new Error(`Sage cadence job ${jobId} disappeared`);
    if (job.state === "completed") return job;
    if (["failed", "dead_letter"].includes(job.state)) {
      throw new Error(
        `Sage cadence job ended ${job.state}: ${job.lastError ?? "unknown error"}`,
      );
    }
    await pause(500);
  }
  throw new Error(`Sage cadence job ${jobId} did not finish within 90 seconds`);
}

async function main() {
  const suffix = randomBytes(5).toString("hex");
  const createdUserIds: string[] = [];
  try {
    const [seeker, host] = await db
      .insert(users)
      .values([
        {
          clerkUserId: `sage_cadence_seeker_${suffix}`,
          email: `sage_cadence_seeker_${suffix}@example.com`,
          name: "Sage Cadence Seeker",
        },
        {
          clerkUserId: `sage_cadence_host_${suffix}`,
          email: `sage_cadence_host_${suffix}@example.com`,
          name: "Sage Cadence Host",
        },
      ])
      .returning();
    createdUserIds.push(seeker.id, host.id);

    await submitDiscoveryEnrollment(
      { user: seeker, kind: "user" },
      {
        intentSlug: "local_meetup",
        claims: {
          participantType: "attendee",
          interests: [`tea-${suffix}`],
          timeWindows: ["saturday afternoon"],
          introductionSummary: "Looking for a small local tea meetup.",
        },
        location: resolvedNeighborhood(seeker.id, suffix),
        requestActivation: true,
      },
    );
    await submitDiscoveryEnrollment(
      { user: host, kind: "user" },
      {
        intentSlug: "local_meetup",
        claims: {
          participantType: "host",
          interests: [`tea-${suffix}`],
          timeWindows: ["saturday afternoon"],
          capacity: 4,
          introductionSummary: "Hosts a small local tea meetup.",
        },
        location: resolvedNeighborhood(host.id, suffix),
        requestActivation: true,
      },
    );

    await setDiscoveryCadence({
      user: seeker,
      intentSlug: "local_meetup",
      enabled: true,
      intervalHours: 24,
      maxRecommendations: 3,
      notifyOnNew: false,
    });
    const dispatched = await dispatchDueDiscoveryCadences(new Date(), 10);
    assert.ok(
      dispatched.sageQueued === 1 || dispatched.scanned === 0,
      "the due cadence must be claimed by this dispatcher or the live worker",
    );
    const [cadence] = await db
      .select()
      .from(discoveryCadences)
      .where(eq(discoveryCadences.userId, seeker.id))
      .limit(1);
    assert.ok(cadence?.lastJobId, "cadence must retain its durable Sage job id");
    const finished = await waitForJob(cadence.lastJobId);
    const result = ownerResultForSageJob(finished);
    assert.equal(finished.trigger, "scheduled");
    assert.equal(result?.intentSlug, "local_meetup");
    assert.ok(Number(result?.candidateCount ?? 0) >= 1);

    const recommendations = await listDiscoveryRecommendations(
      seeker.id,
      "local_meetup",
    );
    assert.ok(recommendations.length >= 1);
    assert.equal(JSON.stringify(recommendations).includes(host.id), false);
    assert.equal(JSON.stringify(recommendations).includes(host.email), false);
    const [stored] = await db
      .select()
      .from(discoveryRecommendations)
      .where(eq(discoveryRecommendations.id, recommendations[0]!.id))
      .limit(1);
    assert.equal(stored.sourceJobId, finished.id);
    console.log(
      "PASS opt-in cadence created durable anonymous recommendations through the live worker",
    );
  } finally {
    for (const userId of createdUserIds) {
      await db.delete(users).where(eq(users.id, userId));
    }
    if (createdUserIds.length) console.log("PASS cadence synthetic rows cleaned up");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("HoneyMatcha Sage cadence e2e FAILED", error);
    process.exit(1);
  });
