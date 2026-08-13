import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDb } from "./index";
import { intentTypes } from "./schema";

config({ path: ".env.local" });
config();

async function seed() {
  const db = getDb();

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
        requiredScopes: ["guest_tasks:write"],
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
      requiredScopes: ["guest_tasks:write"],
      schema: hiringSchema,
    });
    console.log("Seeded intent_types: hiring_compatibility (live)");
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
