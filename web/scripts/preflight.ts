import { config } from "dotenv";
import { eq, isNull } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  agentPairings,
  agentCapabilities,
  apiKeys,
  calendarConnections,
  guestTasks,
  intentTypes,
  links,
  publicInvites,
  purposeEnrollments,
  discoveryInterests,
  discoveryBlocks,
  userLocations,
} from "../src/db/schema";

config({ path: ".env.local" });
config();

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

async function main() {
  const checks: Check[] = [];
  const production =
    process.env.NODE_ENV === "production" ||
    process.env.PREFLIGHT_PRODUCTION === "true";

  checks.push({
    name: "DATABASE_URL",
    ok: Boolean(process.env.DATABASE_URL),
    detail: process.env.DATABASE_URL ? "configured" : "missing",
  });

  for (const name of [
    "GUEST_TOKEN_PEPPER",
    "PUBLIC_INVITE_SECRET",
    "TOKEN_ENCRYPTION_KEY",
    "OAUTH_STATE_SECRET",
  ] as const) {
    const configured = Boolean(process.env[name]);
    const valid =
      name !== "PUBLIC_INVITE_SECRET" ||
      (process.env[name]?.length ?? 0) >= 32;
    checks.push({
      name,
      ok: !production || (configured && valid),
      detail: !configured
        ? production
          ? "required"
          : "optional locally"
        : valid
          ? "configured"
          : "must be at least 32 characters",
    });
  }

  checks.push({
    name: "Production mock calendar",
    ok: !production || process.env.ALLOW_MOCK_CALENDAR !== "true",
    detail:
      process.env.ALLOW_MOCK_CALENDAR === "true"
        ? "must be false in production"
        : "disabled",
  });

  checks.push({
    name: "Discovery rate limiter",
    ok: !production || Boolean(process.env.REDIS_URL),
    detail: process.env.REDIS_URL
      ? "shared Valkey configured"
      : production
        ? "REDIS_URL is required"
        : "in-memory fallback active locally",
  });

  const googleEnabled =
    process.env.GOOGLE_CALENDAR_ENABLED === "true" ||
    process.env.GOOGLE_CALENDAR_ENABLED === "1";
  const googleConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI,
  );
  checks.push({
    name: "Google Calendar",
    ok: !production || (googleEnabled && googleConfigured),
    detail: googleEnabled
      ? googleConfigured
        ? "enabled and configured"
        : "enabled but credentials are incomplete"
      : "disabled",
  });

  if (process.env.DATABASE_URL) {
    const db = getDb();
    try {
      await Promise.all([
        db.select({ id: guestTasks.id }).from(guestTasks).limit(1),
        db.select({ id: agentPairings.id }).from(agentPairings).limit(1),
        db
          .select({ scopes: apiKeys.scopes })
          .from(apiKeys)
          .where(isNull(apiKeys.revokedAt))
          .limit(1),
        db
          .select({ id: publicInvites.id })
          .from(publicInvites)
          .limit(1),
        db
          .select({ publicInviteId: links.publicInviteId })
          .from(links)
          .limit(1),
        db
          .select({ id: purposeEnrollments.id })
          .from(purposeEnrollments)
          .limit(1),
        db
          .select({ id: discoveryInterests.id })
          .from(discoveryInterests)
          .limit(1),
        db.select({ id: discoveryBlocks.id }).from(discoveryBlocks).limit(1),
        db.select({ id: userLocations.id }).from(userLocations).limit(1),
        db
          .select({ id: agentCapabilities.id })
          .from(agentCapabilities)
          .limit(1),
      ]);
      checks.push({
        name: "Current schema",
        ok: true,
        detail:
          "guest, pairing, invite, discovery, location, safety, and capability tables available",
      });
    } catch (error) {
      checks.push({
        name: "Current schema",
        ok: false,
        detail: error instanceof Error ? error.message : "schema check failed",
      });
    }

    try {
      const seededIntents = await db
        .select({
          slug: intentTypes.slug,
          definition: intentTypes.definition,
          discoveryEnabled: intentTypes.discoveryEnabled,
        })
        .from(intentTypes)
        .where(eq(intentTypes.status, "live"));
      const scheduleIntent = seededIntents.find(
        (intent) => intent.slug === "schedule_meeting",
      );
      const hiringIntent = seededIntents.find(
        (intent) =>
          intent.slug === "hiring_compatibility" && intent.discoveryEnabled,
      );
      const meetupIntent = seededIntents.find(
        (intent) => intent.slug === "local_meetup" && intent.discoveryEnabled,
      );
      checks.push({
        name: "Supported task seed",
        ok: Boolean(scheduleIntent && hiringIntent && meetupIntent),
        detail: scheduleIntent && hiringIntent && meetupIntent
          ? "schedule_meeting, hiring discovery, and local meetup discovery are live"
          : "run npm run db:seed",
      });
    } catch (error) {
      checks.push({
        name: "Supported task seed",
        ok: false,
        detail: error instanceof Error ? error.message : "seed check failed",
      });
    }

    try {
      const tokens = await db
        .select({
          id: calendarConnections.id,
          accessToken: calendarConnections.accessToken,
          refreshToken: calendarConnections.refreshToken,
        })
        .from(calendarConnections);
      const plaintext = tokens.filter(
        (token) =>
          !token.accessToken.startsWith("enc:v1:") ||
          !token.refreshToken.startsWith("enc:v1:"),
      );
      checks.push({
        name: "Calendar token encryption",
        ok: plaintext.length === 0,
        detail:
          plaintext.length === 0
            ? `${tokens.length} connection(s), all encrypted`
            : `${plaintext.length} connection(s) must reconnect before deploy`,
      });
    } catch (error) {
      checks.push({
        name: "Calendar token encryption",
        ok: false,
        detail: error instanceof Error ? error.message : "token check failed",
      });
    }
  }

  const width = Math.max(...checks.map((check) => check.name.length));
  for (const check of checks) {
    console.log(
      `${check.ok ? "PASS" : "FAIL"}  ${check.name.padEnd(width)}  ${check.detail}`,
    );
  }
  const failed = checks.filter((check) => !check.ok);
  if (failed.length) {
    console.error(`\nPreflight failed: ${failed.length} check(s) need attention.`);
    process.exit(1);
  }
  console.log("\nHoneyMatcha deployment preflight passed.");
  process.exit(0);
}

main().catch((error) => {
  console.error("HoneyMatcha preflight failed:", error);
  process.exit(1);
});
