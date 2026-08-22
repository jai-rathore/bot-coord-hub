import assert from "node:assert/strict";
import { test } from "node:test";
import { pairedAgentInstructions } from "./agent-pairing";

test("device-paired agents are told to create their standing inbox check", () => {
  const instructions = pairedAgentInstructions();
  assert.match(instructions, /get_inbox at the start of every turn/);
  assert.match(instructions, /set one up now/i);
  assert.match(instructions, /every 15 minutes/);
  assert.match(instructions, /stays silent when nothing is pending/);
  assert.match(instructions, /register_agent_callback/);
});
