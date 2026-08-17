import assert from "node:assert/strict";
import test from "node:test";
import { proposeFreeSlots } from "./freebusy";
import { getAgentCard } from "./agent-card";
import {
  generateGuestToken,
  hashGuestEmail,
  hashGuestToken,
} from "./guest-tokens";
import {
  DEFAULT_AGENT_SCOPES,
  normalizeAgentScopes,
  normalizeLinkScopes,
  PAIRING_AGENT_SCOPES,
} from "./scopes";
import { decryptSecret, encryptSecret } from "./secret-crypto";
import {
  mergeLinkPolicies,
  slotWithinAllAllowedHours,
} from "./policy";
import { parseScheduleWindow } from "./validation";
import {
  CALENDAR_REQUIRED_AGENT_INSTRUCTIONS,
  CALENDAR_REQUIRED_MESSAGE,
  mockCalendarAllowed,
} from "./calendar";
import { buildOAuthState, parseOAuthState } from "./google-oauth";
import { matchHiringConstraints } from "./hiring-match";
import {
  ASK_AGENT_PROMPT,
  FRIEND_INVITE_MESSAGE,
  GROK_BOT_CONNECT_PROMPT,
  GROK_BOT_URL,
  PRODUCTION_ORIGIN,
  agentLlmsText,
} from "./connect-copy";
import {
  inboxKindForSessionActivity,
  peerUserIdsExcludingActor,
} from "./agent-inbox";
import { getDiscoveryDocument } from "./discovery";
import {
  SCHEDULE_COUNTERPARTY_REQUIRED,
  sessionRequiresCounterparty,
} from "./sessions";
import {
  publicInviteIdFromToken,
  publicInviteTokenForId,
  publicInviteUrlForId,
} from "./public-invite-token";

test("default paired agents cannot approve for a human", () => {
  assert.equal(DEFAULT_AGENT_SCOPES.includes("approvals:write"), false);
  assert.equal(PAIRING_AGENT_SCOPES.includes("approvals:write"), false);
  assert.deepEqual(
    normalizeAgentScopes(["tasks:read", "approvals:write"], PAIRING_AGENT_SCOPES),
    ["tasks:read"],
  );
});

test("relationship permissions reject unknown values", () => {
  assert.deepEqual(
    normalizeLinkScopes(["schedule_meeting", "unknown"]),
    ["schedule_meeting"],
  );
});

test("scheduling windows are bounded", () => {
  assert.throws(
    () =>
      parseScheduleWindow(
        "2026-08-01T00:00:00Z",
        "2026-09-01T00:00:00Z",
      ),
    /cannot exceed 14 days/,
  );
});

test("free slots start on quarter-hour boundaries", () => {
  const slots = proposeFreeSlots({
    windowStart: "2026-08-17T09:07:00Z",
    windowEnd: "2026-08-17T11:00:00Z",
    durationMinutes: 30,
    timezone: "UTC",
    busy: [],
  });
  assert.equal(slots[0]?.start, "2026-08-17T09:15:00.000Z");
});

test("different participant policies force confirmation", () => {
  const policy = mergeLinkPolicies([
    {
      confirmRequired: false,
      allowedHours: { start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] },
      timezone: "America/Los_Angeles",
    },
    {
      confirmRequired: false,
      allowedHours: { start: "10:00", end: "16:00", days: [1, 2, 3, 4, 5] },
      timezone: "America/New_York",
    },
  ]);
  assert.equal(policy.confirmRequired, true);
  assert.equal(
    slotWithinAllAllowedHours(
      {
        start: "2026-08-17T18:00:00Z",
        end: "2026-08-17T18:30:00Z",
        timezone: "UTC",
      },
      policy.constraints,
    ),
    true,
  );
});

test("guest capabilities are random, hashed, and email-bound", () => {
  process.env.GUEST_TOKEN_PEPPER = "test-guest-pepper";
  const first = generateGuestToken();
  const second = generateGuestToken();
  assert.match(first.rawToken, /^gt_/);
  assert.notEqual(first.rawToken, second.rawToken);
  assert.equal(hashGuestToken(first.rawToken), first.tokenHash);
  assert.equal(
    hashGuestEmail("Person@Example.com"),
    hashGuestEmail("person@example.com"),
  );
});

test("public invite tokens are signed, tamper-evident, and URL-safe", () => {
  process.env.PUBLIC_INVITE_SECRET =
    "test-public-invite-secret-with-at-least-thirty-two-characters";
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const token = publicInviteTokenForId(id);
  assert.match(token, /^pi_[0-9a-f-]+\.[A-Za-z0-9_-]{43}$/);
  assert.equal(publicInviteIdFromToken(token), id);
  const replacement = token.endsWith("A") ? "B" : "A";
  assert.equal(
    publicInviteIdFromToken(`${token.slice(0, -1)}${replacement}`),
    null,
  );
  assert.equal(
    publicInviteIdFromToken("pi_550e8400-e29b-41d4-a716-446655440000.bad"),
    null,
  );
  assert.equal(
    publicInviteUrlForId("https://honeymatcha.io/", id),
    `https://honeymatcha.io/join/${encodeURIComponent(token)}`,
  );
});

test("integration credentials use authenticated encryption", () => {
  process.env.TOKEN_ENCRYPTION_KEY =
    "test-token-encryption-key-with-sufficient-entropy";
  const encrypted = encryptSecret("refresh-token-value");
  assert.match(encrypted, /^enc:v1:/);
  assert.equal(decryptSecret(encrypted), "refresh-token-value");
  assert.equal(encrypted.includes("refresh-token-value"), false);
});

test("Google OAuth state is signed and bound to the browser nonce", () => {
  process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret";
  const generated = buildOAuthState("user-123");
  assert.equal(parseOAuthState(generated.state, generated.nonce), "user-123");
  assert.equal(parseOAuthState(generated.state, "wrong-nonce"), null);
});

test("A2A card advertises the v1 interface and scoped auth", () => {
  const card = getAgentCard("https://honeymatcha.io");
  assert.equal(card.supportedInterfaces[0]?.protocolVersion, "1.0");
  assert.equal(
    card.supportedInterfaces[0]?.url,
    "https://honeymatcha.io/api/a2a",
  );
  assert.ok(card.skills.some((skill) => skill.id === "guest-task"));
  assert.deepEqual(card.security, [{ honeymatchaBearer: [] }]);
});

test("production never enables a simulated calendar by default", () => {
  assert.equal(mockCalendarAllowed("production", "false"), false);
  assert.equal(mockCalendarAllowed("production", "true"), true);
  assert.equal(mockCalendarAllowed("development", undefined), true);
});

test("hiring compatibility returns dimensions without raw values", () => {
  const compatible = matchHiringConstraints(
    {
      compensationMaximum: 180_000,
      locations: ["New York"],
      workModes: ["Hybrid"],
      sponsorshipAvailable: true,
      latestStart: "2026-11-01",
      levels: ["Senior"],
    },
    {
      compensationMinimum: 165_000,
      locations: ["New York"],
      workModes: ["Hybrid"],
      sponsorshipRequired: true,
      earliestStart: "2026-10-01",
      levels: ["Senior"],
    },
  );
  assert.equal(compatible.verdict, "compatible");
  assert.equal(compatible.dimensions.compensation, "compatible");
  assert.equal("compensationMaximum" in compatible, false);

  const incompatible = matchHiringConstraints(
    { compensationMaximum: 150_000, sponsorshipAvailable: false },
    { compensationMinimum: 175_000, sponsorshipRequired: true },
  );
  assert.equal(incompatible.verdict, "incompatible");
  assert.equal(incompatible.dimensions.sponsorship, "incompatible");

  const review = matchHiringConstraints({}, {});
  assert.equal(review.verdict, "human_review");
});

test("connect copy uses the production origin and never asks agents to sign in", () => {
  assert.equal(PRODUCTION_ORIGIN, "https://honeymatcha.io");
  assert.equal(GROK_BOT_URL, "https://x.ai/bot");
  assert.equal(ASK_AGENT_PROMPT, "Connect to https://honeymatcha.io as my agent.");
  assert.match(GROK_BOT_CONNECT_PROMPT, /Grok Bot/);
  assert.match(GROK_BOT_CONNECT_PROMPT, /Plugins/);
  assert.match(GROK_BOT_CONNECT_PROMPT, /honeymatcha\.io\/api\/mcp/);
  assert.match(GROK_BOT_CONNECT_PROMPT, /honeymatcha\.io\/api\/v1\/pairings\/start/);
  assert.match(GROK_BOT_CONNECT_PROMPT, /Do not sign in as me/);
  assert.match(FRIEND_INVITE_MESSAGE, /PASTE_INVITE_URL_HERE/);
  assert.match(FRIEND_INVITE_MESSAGE, /connect to honeymatcha\.io as my agent/);
  assert.equal(FRIEND_INVITE_MESSAGE.includes("YOUR_HOST"), false);

  const llms = agentLlmsText();
  assert.match(llms, /not a chat app/i);
  assert.match(llms, /Plugins/);
  assert.match(llms, /oauth-authorization-server/);
  assert.match(llms, /pairings\/start/);
  assert.match(llms, /Never sign in as the human/);
  assert.match(llms, /get_inbox/);
  assert.match(llms, /Never create a Google Calendar event yourself/);
  assert.match(llms, /Connect Calendar at https:\/\/honeymatcha.io\/app\/settings/);
  assert.match(llms, /Do not call create_session/);
  assert.match(llms, /get_agent_profile/);
  assert.match(llms, /request_agent_connection/);

  const discovery = getDiscoveryDocument("https://honeymatcha.io");
  assert.match(discovery.what, /not a chat app/);
  assert.match(discovery.connect_as_agent, /Plugins Authorize|start pairing immediately/);
  assert.match(discovery.agent_instructions, /Never sign in as the human/);
  assert.match(discovery.agent_instructions, /get_inbox/);
  assert.match(discovery.agent_instructions, /Connect Calendar at \/app\/settings/);
  assert.match(discovery.agent_instructions, /do not call create_session/i);
  assert.equal(discovery.auth.oauth?.authorize, "https://honeymatcha.io/oauth/authorize");
  assert.equal(discovery.mcp.http, "https://honeymatcha.io/api/mcp");
  assert.equal(discovery.llms, "https://honeymatcha.io/llms.txt");
  assert.equal(
    discovery.endpoints.get_agent_profile.path,
    "/api/v1/profiles/:handle",
  );
  assert.equal(
    discovery.endpoints.request_agent_connection.path,
    "/api/v1/profiles/:handle/connect",
  );
});

test("schedule_meeting sessions require a counterparty; hiring does not", () => {
  assert.equal(sessionRequiresCounterparty("schedule_meeting"), true);
  assert.equal(sessionRequiresCounterparty("hiring_compatibility"), false);
  assert.match(SCHEDULE_COUNTERPARTY_REQUIRED, /request_schedule_meeting/);
  assert.match(SCHEDULE_COUNTERPARTY_REQUIRED, /peerUserId or linkId/);
});

test("board and session activity notify the peer, not the actor", () => {
  assert.equal(
    inboxKindForSessionActivity("schedule_meeting"),
    "schedule.requested",
  );
  assert.equal(
    inboxKindForSessionActivity("hiring_compatibility"),
    "session.activity",
  );
  assert.deepEqual(
    peerUserIdsExcludingActor({
      actorUserId: "alice",
      initiatorUserId: "alice",
      peerUserId: "rishav",
      participantUserIds: ["alice", "rishav"],
    }),
    ["rishav"],
  );
  assert.deepEqual(
    peerUserIdsExcludingActor({
      actorUserId: "rishav",
      initiatorUserId: "alice",
      peerUserId: "rishav",
    }),
    ["alice"],
  );
  assert.deepEqual(
    peerUserIdsExcludingActor({
      actorUserId: "alice",
      initiatorUserId: "alice",
      peerUserId: null,
    }),
    [],
  );
});

test("missing production calendar keeps the 409 and points at settings", () => {
  assert.match(CALENDAR_REQUIRED_MESSAGE, /never simulates production bookings/);
  assert.match(CALENDAR_REQUIRED_AGENT_INSTRUCTIONS, /\/app\/settings/);
  assert.match(CALENDAR_REQUIRED_AGENT_INSTRUCTIONS, /Do not call create_session/);
});
