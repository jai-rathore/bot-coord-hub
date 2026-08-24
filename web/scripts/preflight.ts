import { config } from "dotenv";
import { eq, isNull } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  agentPairings,
  agentProfiles,
  agentCapabilities,
  eventActivity,
  eventDimensions,
  eventMessages,
  eventNotes,
  eventOptions,
  eventParticipants,
  eventResponses,
  events,
  apiKeys,
  calendarConnections,
  guestTasks,
  intentTypes,
  links,
  publicInvites,
  purposeEnrollments,
  discoveryInterests,
  discoveryPairHistory,
  discoveryBlocks,
  discoveryCadences,
  discoveryRecommendations,
  sageDiscoveryMessages,
  sageDiscoveryThreads,
  sageJobs,
  userLocations,
} from "../src/db/schema";
import {
  canonicalLocationsEnabled,
  discoveryFeatureEnabled,
} from "../src/lib/discovery-feature";

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
    ok:
      !production ||
      !discoveryFeatureEnabled() ||
      Boolean(process.env.REDIS_URL),
    detail: process.env.REDIS_URL
      ? "shared Valkey configured"
      : production && discoveryFeatureEnabled()
        ? "REDIS_URL is required before enabling discovery"
        : "not required while discovery is disabled",
  });

  checks.push({
    name: "Discovery feature flag",
    ok: true,
    detail: discoveryFeatureEnabled()
      ? "enabled"
      : "disabled (safe deployment default)",
  });
  checks.push({
    name: "Canonical location contracts",
    ok: true,
    detail: canonicalLocationsEnabled()
      ? "v2 canonical contracts enabled"
      : "v1 compatibility mode",
  });

  const geoapifyConfigured = Boolean(process.env.GEOAPIFY_API_KEY?.trim());
  checks.push({
    name: "Discovery location resolver",
    ok: !production || !discoveryFeatureEnabled() || geoapifyConfigured,
    detail: geoapifyConfigured
      ? "Geoapify configured"
      : production && discoveryFeatureEnabled()
        ? "GEOAPIFY_API_KEY is required before enabling discovery"
        : "not required for local/CI or while discovery is disabled",
  });

  const safetyAdminsConfigured = Boolean(
    process.env.INTENT_ADMIN_EMAILS?.trim(),
  );
  checks.push({
    name: "Discovery safety admins",
    ok: !production || !discoveryFeatureEnabled() || safetyAdminsConfigured,
    detail: safetyAdminsConfigured
      ? "configured"
      : production && discoveryFeatureEnabled()
        ? "INTENT_ADMIN_EMAILS is required before enabling discovery"
        : "not required for local/CI or while discovery is disabled",
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
        db
          .select({
            id: guestTasks.id,
            tokenEncrypted: guestTasks.tokenEncrypted,
            idempotencyKey: guestTasks.idempotencyKey,
          })
          .from(guestTasks)
          .limit(1),
        db.select({ id: agentPairings.id }).from(agentPairings).limit(1),
        db
          .select({
            scopes: apiKeys.scopes,
            audience: apiKeys.audience,
            expiresAt: apiKeys.expiresAt,
            callbackUrl: apiKeys.callbackUrl,
          })
          .from(apiKeys)
          .where(isNull(apiKeys.revokedAt))
          .limit(1),
        db
          .select({ id: publicInvites.id })
          .from(publicInvites)
          .limit(1),
        db
          .select({
            publicInviteId: links.publicInviteId,
            profileHandle: links.profileHandle,
          })
          .from(links)
          .limit(1),
        db.select({ handle: agentProfiles.handle }).from(agentProfiles).limit(1),
        db
          .select({ id: purposeEnrollments.id })
          .from(purposeEnrollments)
          .limit(1),
        db
          .select({ id: discoveryInterests.id })
          .from(discoveryInterests)
          .limit(1),
        db
          .select({ id: discoveryPairHistory.id })
          .from(discoveryPairHistory)
          .limit(1),
        db.select({ id: discoveryBlocks.id }).from(discoveryBlocks).limit(1),
        db
          .select({ id: discoveryCadences.id })
          .from(discoveryCadences)
          .limit(1),
        db
          .select({ id: discoveryRecommendations.id })
          .from(discoveryRecommendations)
          .limit(1),
        db.select({ id: userLocations.id }).from(userLocations).limit(1),
        db
          .select({ id: agentCapabilities.id })
          .from(agentCapabilities)
          .limit(1),
        db
          .select({ id: events.id, idempotencyKey: events.idempotencyKey })
          .from(events)
          .limit(1),
        db.select({ id: eventDimensions.id }).from(eventDimensions).limit(1),
        db
          .select({
            id: eventOptions.id,
            idempotencyKey: eventOptions.idempotencyKey,
          })
          .from(eventOptions)
          .limit(1),
        db
          .select({ id: eventParticipants.id })
          .from(eventParticipants)
          .limit(1),
        db.select({ id: eventResponses.id }).from(eventResponses).limit(1),
        db
          .select({
            id: eventActivity.id,
            idempotencyKey: eventActivity.idempotencyKey,
          })
          .from(eventActivity)
          .limit(1),
        db
          .select({
            id: eventNotes.id,
            idempotencyKey: eventNotes.idempotencyKey,
          })
          .from(eventNotes)
          .limit(1),
        db
          .select({
            id: eventMessages.id,
            idempotencyKey: eventMessages.idempotencyKey,
            turnCounted: eventMessages.turnCounted,
            provider: eventMessages.provider,
            model: eventMessages.model,
          })
          .from(eventMessages)
          .limit(1),
        db
          .select({
            id: sageJobs.id,
            payloadEncrypted: sageJobs.payloadEncrypted,
            resultEncrypted: sageJobs.resultEncrypted,
          })
          .from(sageJobs)
          .limit(1),
        db
          .select({ id: sageDiscoveryThreads.id })
          .from(sageDiscoveryThreads)
          .limit(1),
        db
          .select({ id: sageDiscoveryMessages.id })
          .from(sageDiscoveryMessages)
          .limit(1),
      ]);
      checks.push({
        name: "Current schema",
        ok: true,
        detail:
          "agent credentials, guest, pairing, invite, profile, discovery, event, and Sage tables available",
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
        (intent) => intent.slug === "hiring_compatibility",
      );
      const meetupIntent = seededIntents.find(
        (intent) => intent.slug === "local_meetup",
      );
      const discoverySeedMatchesFlag =
        Boolean(hiringIntent && meetupIntent) &&
        hiringIntent!.discoveryEnabled === discoveryFeatureEnabled() &&
        meetupIntent!.discoveryEnabled === discoveryFeatureEnabled();
      checks.push({
        name: "Supported task seed",
        ok: Boolean(scheduleIntent && discoverySeedMatchesFlag),
        detail: scheduleIntent && discoverySeedMatchesFlag
          ? discoveryFeatureEnabled()
            ? "schedule_meeting is live; hiring and meetup discovery are enabled"
            : "schedule_meeting is live; discovery seeds are safely disabled"
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
