import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDb } from "./index";
import { intentTypes } from "./schema";
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
    await db
      .update(intentTypes)
      .set({
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
        updatedAt: new Date(),
      })
      .where(eq(intentTypes.id, existingHiring.id));
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
    await db
      .update(intentTypes)
      .set({
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
        updatedAt: new Date(),
      })
      .where(eq(intentTypes.id, existingMeetup.id));
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
