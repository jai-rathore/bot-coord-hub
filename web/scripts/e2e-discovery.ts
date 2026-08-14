import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  apiKeys,
  discoveryHandles,
  discoveryInterests,
  intentTypes,
  safetyReports,
  sessions,
  users,
} from "../src/db/schema";
import {
  DATING_INTRODUCTION_DEFINITION,
  HIRING_DISCOVERY_DEFINITION,
  LOCAL_MEETUP_DEFINITION,
} from "../src/lib/intent-definitions";
import {
  blockDiscoveryParticipant,
  decideDiscoveryEnrollment,
  decideDiscoveryInterest,
  getAgentCapabilityManifest,
  listDiscoveryInterests,
  reportDiscoveryParticipant,
  requestDiscoveryIntroduction,
  searchDiscovery,
  setDiscoverySafetyStatus,
  submitDiscoveryEnrollment,
  upsertAgentCapabilityManifest,
} from "../src/lib/discovery-service";

process.env.TOKEN_ENCRYPTION_KEY =
  process.env.TOKEN_ENCRYPTION_KEY ??
  "e2e-discovery-encryption-key-with-sufficient-entropy";

const db = getDb();
const suffix = randomUUID().slice(0, 8);
const clerkIds = [
  `e2e-discovery-seeker-${suffix}`,
  `e2e-discovery-host-${suffix}`,
  `e2e-discovery-moderator-${suffix}`,
];

async function seedDiscoveryIntents() {
  for (const intent of [
    {
      slug: "hiring_compatibility",
      name: "Check hiring compatibility",
      description: "Private recruiting discovery.",
      category: "hiring",
      requiredScopes: ["discovery:read", "discovery:write"],
      definition: HIRING_DISCOVERY_DEFINITION,
    },
    {
      slug: "local_meetup",
      name: "Discover a local meetup",
      description: "Private local meetup discovery.",
      category: "social_coordination",
      requiredScopes: ["discovery:read", "discovery:write"],
      definition: LOCAL_MEETUP_DEFINITION,
    },
  ]) {
    await db
      .insert(intentTypes)
      .values({
        ...intent,
        status: "live",
        definitionVersion: intent.definition.version,
        discoveryEnabled: intent.definition.discovery.enabled,
        handler: intent.definition.discovery.handler,
      })
      .onConflictDoUpdate({
        target: intentTypes.slug,
        set: {
          status: "live",
          definitionVersion: intent.definition.version,
          definition: intent.definition,
          discoveryEnabled: intent.definition.discovery.enabled,
          handler: intent.definition.discovery.handler,
          updatedAt: new Date(),
        },
      });
  }
}

async function main() {
  await seedDiscoveryIntents();
  const [seeker, host, moderator] = await db
    .insert(users)
    .values([
      {
        clerkUserId: clerkIds[0],
        email: `seeker-${suffix}@example.com`,
        name: "Seeker Example",
      },
      {
        clerkUserId: clerkIds[1],
        email: `host-${suffix}@example.com`,
        name: "Host Example",
      },
      {
        clerkUserId: clerkIds[2],
        email: `moderator-${suffix}@example.com`,
        name: "Moderator Example",
      },
    ])
    .returning();

  const [key] = await db
    .insert(apiKeys)
    .values({
      userId: seeker.id,
      name: "Discovery test agent",
      keyPrefix: "hm_test",
      keyHash: randomUUID().replaceAll("-", ""),
      scopes: ["discovery:read", "discovery:write"],
    })
    .returning();
  await upsertAgentCapabilityManifest({
    apiKeyId: key.id,
    supportedIntents: { local_meetup: 1, hiring_compatibility: 1 },
    platforms: ["integration-test"],
    metadata: { mode: "test" },
  });
  const manifest = await getAgentCapabilityManifest(key.id);
  assert.equal(manifest?.supportedIntents.local_meetup, 1);

  const pending = await submitDiscoveryEnrollment(
    { user: seeker, kind: "agent", apiKeyId: key.id },
    {
      intentSlug: "local_meetup",
      claims: {
        participantType: "attendee",
        interests: ["board games", "coffee"],
        timeWindows: ["saturday afternoon"],
        introductionSummary: "Enjoys small, friendly strategy-game meetups.",
      },
      provenance: {
        participantType: { source: "human conversation" },
        interests: { source: "human conversation" },
        timeWindows: { source: "human conversation" },
        introductionSummary: { source: "human conversation" },
      },
      location: {
        label: "Park Slope",
        countryCode: "US",
        region: "NY",
        locality: "Brooklyn",
        neighborhood: "Park Slope",
        granularity: "neighborhood",
        visibility: "private_match",
      },
      requestActivation: true,
    },
  );
  assert.equal(pending.status, "pending_approval");
  await decideDiscoveryEnrollment({
    user: seeker,
    enrollmentId: pending.id!,
    decision: "approve",
  });

  await submitDiscoveryEnrollment(
    { user: host, kind: "user" },
    {
      intentSlug: "local_meetup",
      claims: {
        participantType: "host",
        interests: ["board games", "tea"],
        timeWindows: ["saturday afternoon"],
        capacity: 6,
        introductionSummary: "Hosts an accessible monthly game afternoon.",
      },
      location: {
        label: "Park Slope",
        countryCode: "US",
        region: "NY",
        locality: "Brooklyn",
        neighborhood: "Park Slope",
        granularity: "neighborhood",
        visibility: "private_match",
      },
      requestActivation: true,
    },
  );

  const firstSearch = await searchDiscovery({
    actor: { user: seeker, kind: "agent", apiKeyId: key.id },
    intentSlug: "local_meetup",
  });
  assert.equal(firstSearch.candidates.length, 1);
  const firstCandidate = firstSearch.candidates[0]!;
  assert.match(firstCandidate.candidateHandle, /^dc_/);
  assert.equal(firstCandidate.compatibility.verdict, "compatible");
  const serializedCandidate = JSON.stringify(firstCandidate);
  assert.equal(serializedCandidate.includes(host.id), false);
  assert.equal(serializedCandidate.includes(host.email), false);
  assert.equal(serializedCandidate.includes("capacity"), false);

  const secondSearch = await searchDiscovery({
    actor: { user: seeker, kind: "agent", apiKeyId: key.id },
    intentSlug: "local_meetup",
  });
  assert.notEqual(
    secondSearch.candidates[0]?.candidateHandle,
    firstCandidate.candidateHandle,
  );

  const request = await requestDiscoveryIntroduction({
    actor: { user: seeker, kind: "agent", apiKeyId: key.id },
    candidateHandle: firstCandidate.candidateHandle,
    idempotencyKey: `intro-${suffix}`,
  });
  assert.equal(request.status, "pending");
  const beforeApproval = await listDiscoveryInterests(host.id);
  assert.equal(beforeApproval[0]?.direction, "incoming");
  assert.equal(beforeApproval[0]?.disclosure, null);
  assert.equal(JSON.stringify(beforeApproval).includes(seeker.email), false);

  const accepted = await decideDiscoveryInterest({
    user: host,
    interestId: request.interestId,
    decision: "accept",
  });
  assert.equal(accepted.status, "accepted");
  assert.ok(accepted.sessionId);
  assert.equal(JSON.stringify(accepted.disclosure).includes(seeker.email), false);
  assert.equal(
    accepted.disclosure.introductionSummary,
    "Enjoys small, friendly strategy-game meetups.",
  );
  const [meetupSession] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, accepted.sessionId!));
  assert.equal(meetupSession.intentType, "local_meetup");

  await reportDiscoveryParticipant({
    actor: { user: seeker, kind: "user" },
    interestId: request.interestId,
    reasonCode: "e2e_safety_test",
    details: "Integration test report.",
    block: true,
  });
  const [report] = await db
    .select()
    .from(safetyReports)
    .where(eq(safetyReports.interestId, request.interestId));
  assert.equal(report.status, "open");

  const afterBlock = await searchDiscovery({
    actor: { user: seeker, kind: "user" },
    intentSlug: "local_meetup",
  });
  assert.equal(afterBlock.candidates.length, 0);

  await blockDiscoveryParticipant({
    actor: { user: seeker, kind: "user" },
    interestId: request.interestId,
    reasonCode: "idempotent_test",
  });

  await setDiscoverySafetyStatus({
    moderator,
    subjectUserId: seeker.id,
    status: "suspended",
    reasonCode: "e2e_test",
  });
  await assert.rejects(
    () =>
      searchDiscovery({
        actor: { user: seeker, kind: "user" },
        intentSlug: "local_meetup",
      }),
    /restricted/,
  );

  assert.equal(DATING_INTRODUCTION_DEFINITION.discovery.enabled, false);
  const datingRows = await db
    .select()
    .from(intentTypes)
    .where(eq(intentTypes.slug, "dating_introduction"));
  assert.equal(datingRows.length, 0);

  const interestRows = await db
    .select()
    .from(discoveryInterests)
    .where(eq(discoveryInterests.id, request.interestId));
  assert.equal(interestRows[0]?.status, "accepted");
  const handleRows = await db
    .select()
    .from(discoveryHandles)
    .where(eq(discoveryHandles.requesterUserId, seeker.id));
  assert.ok(handleRows.length >= 2);
  console.log(
    "Discovery E2E passed: agent approval, opaque search, mutual disclosure, meetup handoff, block/report, and suspension.",
  );
}

main()
  .finally(async () => {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.clerkUserId, clerkIds));
    if (rows.length) {
      await db.delete(users).where(
        inArray(
          users.id,
          rows.map((row) => row.id),
        ),
      );
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
