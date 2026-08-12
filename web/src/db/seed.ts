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
        "Agents negotiate a meeting time using free/busy only; humans confirm bookings by default.",
      status: "live",
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
    console.log("intent_types already has schedule_meeting — skipped");
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
