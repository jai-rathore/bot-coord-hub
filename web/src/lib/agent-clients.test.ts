import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGENT_CLIENTS,
  STANDING_CHECK_INTERVAL_MINUTES,
  agentClient,
  clientsWithStandingCheck,
  grokWebhookPrompt,
  standingCheckInstruction,
  standingCheckPrompt,
} from "./agent-clients";
import { agentLlmsText, mcpConnectInstructions } from "./connect-copy";

test("every client has a connect path a human can follow", () => {
  for (const client of AGENT_CLIENTS) {
    assert.ok(client.name.length > 0, `${client.id} needs a name`);
    assert.ok(
      client.connectSteps.length > 0,
      `${client.id} needs connect steps`,
    );
    assert.match(client.homeUrl, /^https:\/\//);
    if (client.connectDocsUrl) assert.match(client.connectDocsUrl, /^https:\/\//);
  }
});

test("the four assistants people already have are all covered", () => {
  for (const id of ["claude", "chatgpt", "gemini", "grok"] as const) {
    assert.ok(agentClient(id).standingCheck, `${id} should schedule a check`);
  }
});

test("unknown clients fail loudly rather than rendering blank", () => {
  // @ts-expect-error deliberately outside the union
  assert.throws(() => agentClient("copilot"), /Unknown agent client/);
});

test("clientsWithStandingCheck drops the ones that cannot schedule", () => {
  const ids = clientsWithStandingCheck().map((client) => client.id);
  assert.ok(ids.includes("claude"));
  assert.ok(!ids.includes("cursor"), "Cursor has no scheduler");
});

test("the standing-check prompt names the tool, the interval, and silence", () => {
  const prompt = standingCheckPrompt("https://honeymatcha.io/");
  assert.match(prompt, /get_inbox/);
  assert.match(prompt, new RegExp(`${STANDING_CHECK_INTERVAL_MINUTES} minutes`));
  assert.match(prompt, /ack_inbox/);
  assert.match(prompt, /do not message me/i);
  // A scheduler stores this verbatim, so a trailing slash must not double up.
  assert.match(prompt, /https:\/\/honeymatcha\.io\./);
  assert.ok(!prompt.includes("honeymatcha.io/."));
});

test("the prompt never lets an agent answer for its human", () => {
  const prompt = standingCheckPrompt("https://honeymatcha.io");
  assert.match(prompt, /never book a calendar event yourself/i);
  assert.match(prompt, /never answer on my behalf/i);
});

test("connect instructions ask for the schedule, not just per-turn polling", () => {
  const instructions = mcpConnectInstructions();
  assert.match(instructions, /get_inbox at the start of every turn/);
  assert.match(instructions, /schedule/i);
  assert.match(instructions, /register_agent_callback/);
  assert.match(instructions, /Never book Google Calendar yourself/);
});

test("standingCheckInstruction honours a caller's interval", () => {
  assert.match(standingCheckInstruction(5), /every 5 minutes/);
});

test("llms.txt tells an agent both how to connect and how to stay awake", () => {
  const text = agentLlmsText("https://honeymatcha.io");
  for (const client of AGENT_CLIENTS) {
    assert.ok(
      text.includes(client.name),
      `llms.txt should name ${client.name}`,
    );
  }
  assert.match(text, /standingCheck/);
  assert.match(text, /register_agent_callback/);
  assert.match(text, /https:\/\/honeymatcha\.io\/api\/mcp/);
  assert.match(text, /how-to-connect-agents/);
});

test("llms.txt respects a non-production origin", () => {
  const text = agentLlmsText("https://staging.honeymatcha.io/");
  assert.match(text, /https:\/\/staging\.honeymatcha\.io\/api\/mcp/);
  assert.ok(!text.includes("staging.honeymatcha.io//"));
});

test("Grok standing check prefers a webhook routine over polling only", () => {
  const grok = agentClient("grok");
  assert.equal(grok.standingCheck?.featureName, "webhook routines");
  assert.match(grok.standingCheck?.steps.join(" ") ?? "", /sender key/);
  assert.match(grok.standingCheck?.steps.join(" ") ?? "", /desktop/);
  assert.match(grok.caveat ?? "", /desktop app/);
});

test("standingCheckInstruction mentions Grok webhook authorization", () => {
  assert.match(standingCheckInstruction(), /Grok Bot webhook routine/);
  assert.match(standingCheckInstruction(), /callbackAuthorization/);
});

test("the Grok webhook prompt names inbox fields and stays quiet", () => {
  const prompt = grokWebhookPrompt("https://honeymatcha.io/");
  assert.match(prompt, /get_inbox/);
  assert.match(prompt, /ack_inbox/);
  assert.match(prompt, /untrusted data/);
  assert.match(prompt, /do not message me/i);
  assert.match(prompt, /https:\/\/honeymatcha\.io\./);
  assert.ok(!prompt.includes("honeymatcha.io/."));
});
