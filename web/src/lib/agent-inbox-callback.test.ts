import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentApiError } from "./agent-errors";
import {
  CALLBACK_AUTHORIZATION_MAX,
  callbackDeliveryHeaders,
  normalizeCallbackAuthorization,
  standingCheckStatus,
} from "./agent-inbox";

test("normalizeCallbackAuthorization strips a copied Bearer prefix", () => {
  assert.equal(
    normalizeCallbackAuthorization("Bearer crsr_sender_key"),
    "crsr_sender_key",
  );
  assert.equal(
    normalizeCallbackAuthorization("bearer   abc123"),
    "abc123",
  );
});

test("normalizeCallbackAuthorization treats empty as clear", () => {
  assert.equal(normalizeCallbackAuthorization(undefined), undefined);
  assert.equal(normalizeCallbackAuthorization(null), null);
  assert.equal(normalizeCallbackAuthorization(""), null);
  assert.equal(normalizeCallbackAuthorization("   "), null);
  assert.equal(normalizeCallbackAuthorization("Bearer   "), null);
});

test("normalizeCallbackAuthorization rejects bad values", () => {
  assert.throws(
    () => normalizeCallbackAuthorization(12),
    (err: unknown) =>
      err instanceof AgentApiError && /must be text/.test(err.message),
  );
  assert.throws(
    () => normalizeCallbackAuthorization("key\nwith\nnewlines"),
    (err: unknown) =>
      err instanceof AgentApiError && /invalid characters/.test(err.message),
  );
  assert.throws(
    () => normalizeCallbackAuthorization("x".repeat(CALLBACK_AUTHORIZATION_MAX + 1)),
    (err: unknown) =>
      err instanceof AgentApiError && /400 characters or fewer/.test(err.message),
  );
});

test("callbackDeliveryHeaders add Grok Bot webhook auth when a key is set", () => {
  assert.deepEqual(callbackDeliveryHeaders(null), {
    "content-type": "application/json",
    "x-honeymatcha-event": "agent_inbox",
  });
  assert.deepEqual(callbackDeliveryHeaders("sender-key"), {
    "content-type": "application/json",
    "x-honeymatcha-event": "agent_inbox",
    authorization: "Bearer sender-key",
    "x-automation-key": "sender-key",
  });
});

test("standingCheckStatus advertises the Grok webhook path until a callback is registered", () => {
  const unset = standingCheckStatus({ callbackRegistered: false });
  assert.equal(unset.satisfied, false);
  assert.match(unset.instructions, /Grok Bot webhook routine/);
  assert.match(unset.webhook.instructions, /register_agent_callback/);
  assert.match(unset.webhook.instructions, /sender key/);
  assert.match(unset.webhook.prompt, /get_inbox/);
  assert.match(unset.webhook.setupUrl, /#grok-bot-webhook/);

  const set = standingCheckStatus({ callbackRegistered: true });
  assert.equal(set.satisfied, true);
  assert.match(set.instructions, /callback URL is registered/);
});
