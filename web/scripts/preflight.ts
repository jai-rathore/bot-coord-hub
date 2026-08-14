import { config } from "dotenv";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  agentPairings,
  apiKeys,
  calendarConnections,
  guestTasks,
  intentTypes,
  links,
  publicInvites,
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
    checks.push({
      name,
      ok: !production || configured,
      detail: configured ? "configured" : production ? "required" : "optional locally",
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
      ]);
      checks.push({
        name: "Current schema",
        ok: true,
        detail:
          "guest tasks, pairings, scoped credentials, and public invites available",
      });
    } catch (error) {
      checks.push({
        name: "Current schema",
        ok: false,
        detail: error instanceof Error ? error.message : "schema check failed",
      });
    }

    try {
      const [scheduleIntent] = await db
        .select({ id: intentTypes.id })
        .from(intentTypes)
        .where(
          and(
            eq(intentTypes.slug, "schedule_meeting"),
            eq(intentTypes.status, "live"),
          ),
        )
        .limit(1);
      checks.push({
        name: "Supported task seed",
        ok: Boolean(scheduleIntent),
        detail: scheduleIntent
          ? "schedule_meeting is live"
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
