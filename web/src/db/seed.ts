import { config } from "dotenv";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { getDb } from "./index";
import {
  agentInbox,
  discoveryHandles,
  discoveryInterests,
  intentTypes,
  purposeEnrollments,
} from "./schema";
import {
  HIRING_DISCOVERY_DEFINITION,
  LOCAL_MEETUP_DEFINITION,
  SCHEDULE_MEETING_DEFINITION,
} from "../lib/intent-definitions";
import { discoveryFeatureEnabled } from "../lib/discovery-feature";

config({ path: ".env.local" });
config();

async function seed() {
  const db = getDb();
  const discoveryEnabled = discoveryFeatureEnabled();
  if (
    process.env.NODE_ENV === "production" &&
    discoveryEnabled &&
    !process.env.GEOAPIFY_API_KEY?.trim()
  ) {
    throw new Error(
      "GEOAPIFY_API_KEY is required before seeding enabled discovery contracts",
    );
  }
  type SeedTransaction = Parameters<
    Parameters<typeof db.transaction>[0]
  >[0];

  async function pauseStaleEnrollments(
    tx: SeedTransaction,
    slug: string,
    version: number,
  ) {
    const stale = await tx
        .select({ id: purposeEnrollments.id })
        .from(purposeEnrollments)
        .where(
          and(
            eq(purposeEnrollments.intentSlug, slug),
            lt(purposeEnrollments.definitionVersion, version),
          ),
        );
    const staleIds = stale.map((enrollment) => enrollment.id);
    if (!staleIds.length) return;
    const pendingInterests = await tx
        .select({ id: discoveryInterests.id })
        .from(discoveryInterests)
        .where(
          and(
            eq(discoveryInterests.status, "pending"),
            or(
              inArray(discoveryInterests.requesterEnrollmentId, staleIds),
              inArray(discoveryInterests.recipientEnrollmentId, staleIds),
            ),
          ),
        );
    const pendingInterestIds = pendingInterests.map((interest) => interest.id);
    if (pendingInterestIds.length) {
      await tx
        .delete(agentInbox)
        .where(inArray(agentInbox.discoveryInterestId, pendingInterestIds));
    }
    await tx
        .delete(discoveryHandles)
        .where(
          or(
            inArray(discoveryHandles.requesterEnrollmentId, staleIds),
            inArray(discoveryHandles.candidateEnrollmentId, staleIds),
          ),
        );
    await tx
        .update(discoveryInterests)
        .set({
          status: "withdrawn",
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(discoveryInterests.status, "pending"),
            or(
              inArray(discoveryInterests.requesterEnrollmentId, staleIds),
              inArray(discoveryInterests.recipientEnrollmentId, staleIds),
            ),
          ),
        );
    await tx
        .update(purposeEnrollments)
        .set({
          status: "paused",
          consentedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(purposeEnrollments.id, staleIds),
            inArray(purposeEnrollments.status, [
              "active",
              "pending_approval",
            ]),
          ),
        );
    console.log(
      `Paused ${staleIds.length} stale ${slug} enrollment(s) for contract v${version} review`,
    );
  }

  const existing = await db
    .select()
    .from(intentTypes)
    .where(eq(intentTypes.slug, "schedule_meeting"))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(intentTypes).values({
      slug: "schedule_meeting",
      name: "Schedule meeting",
      description:
        "Handle availability, follow-ups, approval, and final booking across people.",
      status: "live",
      category: "professional_organizing",
      requiredScopes: ["tasks:write"],
      definitionVersion: SCHEDULE_MEETING_DEFINITION.version,
      definition: SCHEDULE_MEETING_DEFINITION,
      discoveryEnabled: SCHEDULE_MEETING_DEFINITION.discovery.enabled,
      handler: SCHEDULE_MEETING_DEFINITION.discovery.handler,
      schema: {
        durationMinutes: "number",
        windowStart: "string (ISO datetime)",
        windowEnd: "string (ISO datetime)",
        timezone: "string",
        title: "string",
      },
    });
    console.log("Seeded intent_types: schedule_meeting (live)");
  } else {
    await db
      .update(intentTypes)
      .set({
        name: "Schedule meeting",
        description:
          "Handle availability, follow-ups, approval, and final booking across people.",
        status: "live",
        category: "professional_organizing",
        requiredScopes: ["tasks:write"],
        definitionVersion: SCHEDULE_MEETING_DEFINITION.version,
        definition: SCHEDULE_MEETING_DEFINITION,
        discoveryEnabled: SCHEDULE_MEETING_DEFINITION.discovery.enabled,
        handler: SCHEDULE_MEETING_DEFINITION.discovery.handler,
        updatedAt: new Date(),
      })
      .where(eq(intentTypes.id, existing[0].id));
    console.log("Updated intent_types: schedule_meeting");
  }

  const hiringDescription =
    "Privately compare compensation, location, work mode, sponsorship, timing, and level before an introduction. No ranking or automatic rejection.";
  const hiringSchema = {
    taskType: "hiring_compatibility",
    targetEmail: "string",
    privateConfig: {
      compensationMaximum: "number?",
      locations: "string[]?",
      workModes: "string[]?",
      sponsorshipAvailable: "boolean?",
      latestStart: "ISO date?",
      levels: "string[]?",
    },
  };
  const [existingHiring] = await db
    .select()
    .from(intentTypes)
    .where(eq(intentTypes.slug, "hiring_compatibility"))
    .limit(1);
  if (existingHiring) {
    const hiringValues = {
      name: "Check hiring compatibility",
      description: hiringDescription,
      status: "live" as const,
      category: "hiring",
      requiredScopes: [
        "guest_tasks:write",
        "discovery:read",
        "discovery:write",
      ],
      definitionVersion: HIRING_DISCOVERY_DEFINITION.version,
      definition: HIRING_DISCOVERY_DEFINITION,
      discoveryEnabled,
      handler: HIRING_DISCOVERY_DEFINITION.discovery.handler,
      schema: hiringSchema,
      updatedAt: new Date(),
    };
    const upgrading =
      existingHiring.definitionVersion <
      HIRING_DISCOVERY_DEFINITION.version;
    if (upgrading) {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${"discovery-contract:hiring_compatibility"}))`,
        );
        await pauseStaleEnrollments(
          tx,
          "hiring_compatibility",
          HIRING_DISCOVERY_DEFINITION.version,
        );
        await tx
          .update(intentTypes)
          .set(hiringValues)
          .where(eq(intentTypes.id, existingHiring.id));
      });
    } else {
      await db
        .update(intentTypes)
        .set(hiringValues)
        .where(eq(intentTypes.id, existingHiring.id));
    }
    console.log("Updated intent_types: hiring_compatibility");
  } else {
    await db.insert(intentTypes).values({
      slug: "hiring_compatibility",
      name: "Check hiring compatibility",
      description: hiringDescription,
      status: "live",
      category: "hiring",
      requiredScopes: [
        "guest_tasks:write",
        "discovery:read",
        "discovery:write",
      ],
      definitionVersion: HIRING_DISCOVERY_DEFINITION.version,
      definition: HIRING_DISCOVERY_DEFINITION,
      discoveryEnabled,
      handler: HIRING_DISCOVERY_DEFINITION.discovery.handler,
      schema: hiringSchema,
    });
    console.log("Seeded intent_types: hiring_compatibility (live)");
  }

  const meetupDescription =
    "Privately discover hosted meetups by interest and coarse location; identities and venues are disclosed only after approval.";
  const [existingMeetup] = await db
    .select()
    .from(intentTypes)
    .where(eq(intentTypes.slug, "local_meetup"))
    .limit(1);
  if (existingMeetup) {
    const meetupValues = {
      name: "Discover a local meetup",
      description: meetupDescription,
      status: "live" as const,
      category: "social_coordination",
      requiredScopes: ["discovery:read", "discovery:write"],
      definitionVersion: LOCAL_MEETUP_DEFINITION.version,
      definition: LOCAL_MEETUP_DEFINITION,
      discoveryEnabled,
      handler: LOCAL_MEETUP_DEFINITION.discovery.handler,
      schema: {
        enrollment: "purpose-bound",
        location: "country/region/city/neighborhood",
        exactVenueDisclosure: "after_mutual_approval",
      },
      updatedAt: new Date(),
    };
    const upgrading =
      existingMeetup.definitionVersion < LOCAL_MEETUP_DEFINITION.version;
    if (upgrading) {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${"discovery-contract:local_meetup"}))`,
        );
        await pauseStaleEnrollments(
          tx,
          "local_meetup",
          LOCAL_MEETUP_DEFINITION.version,
        );
        await tx
          .update(intentTypes)
          .set(meetupValues)
          .where(eq(intentTypes.id, existingMeetup.id));
      });
    } else {
      await db
        .update(intentTypes)
        .set(meetupValues)
        .where(eq(intentTypes.id, existingMeetup.id));
    }
    console.log("Updated intent_types: local_meetup");
  } else {
    await db.insert(intentTypes).values({
      slug: "local_meetup",
      name: "Discover a local meetup",
      description: meetupDescription,
      status: "live",
      category: "social_coordination",
      requiredScopes: ["discovery:read", "discovery:write"],
      definitionVersion: LOCAL_MEETUP_DEFINITION.version,
      definition: LOCAL_MEETUP_DEFINITION,
      discoveryEnabled,
      handler: LOCAL_MEETUP_DEFINITION.discovery.handler,
      schema: {
        enrollment: "purpose-bound",
        location: "country/region/city/neighborhood",
        exactVenueDisclosure: "after_mutual_approval",
      },
    });
    console.log("Seeded intent_types: local_meetup (live)");
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
