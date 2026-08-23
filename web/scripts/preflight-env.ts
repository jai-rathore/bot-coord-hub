import { config } from "dotenv";
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

const production =
  process.env.NODE_ENV === "production" ||
  process.env.PREFLIGHT_PRODUCTION === "true";
const discoveryEnabled = discoveryFeatureEnabled();
const canonicalLocations = canonicalLocationsEnabled();
const checks: Check[] = [];

function required(name: string, enabled = production, minimumLength = 1) {
  const value = process.env[name]?.trim() ?? "";
  checks.push({
    name,
    ok: !enabled || value.length >= minimumLength,
    detail: value
      ? value.length >= minimumLength
        ? "configured"
        : `must be at least ${minimumLength} characters`
      : enabled
        ? "required"
        : "optional in this environment",
  });
}

required("DATABASE_URL");
required("GUEST_TOKEN_PEPPER");
required("PUBLIC_INVITE_SECRET", production, 32);
required("TOKEN_ENCRYPTION_KEY");
required("OAUTH_STATE_SECRET");
required("REDIS_URL", production && discoveryEnabled);
required("GEOAPIFY_API_KEY", production && discoveryEnabled);
required("INTENT_ADMIN_EMAILS", production && discoveryEnabled);

const sageEnabled =
  process.env.ENABLE_SAGE_JOBS === "true" ||
  process.env.ENABLE_SAGE_JOBS === "1";
const hostedProvider = (
  process.env.HOSTED_AGENT_PROVIDER?.trim() || "gemini"
).toLowerCase();
checks.push({
  name: "Hosted Sage provider",
  ok: !production || !sageEnabled || hostedProvider === "gemini",
  detail:
    hostedProvider === "gemini"
      ? "gemini"
      : sageEnabled && production
        ? "must be gemini"
        : hostedProvider,
});
required("GEMINI_API_KEY", production && sageEnabled);

const googleEnabled =
  process.env.GOOGLE_CALENDAR_ENABLED === "true" ||
  process.env.GOOGLE_CALENDAR_ENABLED === "1";
checks.push({
  name: "Google Calendar enabled",
  ok: !production || googleEnabled,
  detail: googleEnabled ? "enabled" : production ? "required" : "optional locally",
});
required("GOOGLE_CLIENT_ID", production);
required("GOOGLE_CLIENT_SECRET", production);
required("GOOGLE_REDIRECT_URI", production);
checks.push({
  name: "Canonical location contracts",
  ok: true,
  detail: canonicalLocations
    ? "v2 activation enabled"
    : "v1 compatibility mode; enable only after resolver code is live",
});
checks.push({
  name: "Production mock calendar",
  ok: !production || process.env.ALLOW_MOCK_CALENDAR !== "true",
  detail:
    process.env.ALLOW_MOCK_CALENDAR === "true"
      ? "must be false in production"
      : "disabled",
});

const width = Math.max(...checks.map((check) => check.name.length));
for (const check of checks) {
  console.log(
    `${check.ok ? "PASS" : "FAIL"}  ${check.name.padEnd(width)}  ${check.detail}`,
  );
}
const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error(
    `\nEnvironment preflight failed before database mutation: ${failed.length} check(s) need attention.`,
  );
  process.exit(1);
}
console.log("\nEnvironment preflight passed; database migration may proceed.");
