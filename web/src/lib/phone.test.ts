import assert from "node:assert/strict";
import test from "node:test";
import {
  followCopy,
  formatPhoneForInput,
  humanChannelsFor,
  normalizePhoneE164,
  parseNotifyChannel,
  wantsEmail,
  wantsSms,
} from "./phone";

test("US numbers normalize to E.164", () => {
  assert.equal(normalizePhoneE164("(555) 123-4567"), "+15551234567");
  assert.equal(normalizePhoneE164("5551234567"), "+15551234567");
  assert.equal(normalizePhoneE164("1 555 123 4567"), "+15551234567");
  assert.equal(normalizePhoneE164("+1 555 123 4567"), "+15551234567");
});

test("already-E.164 numbers stay put", () => {
  assert.equal(normalizePhoneE164("+447911123456"), "+447911123456");
});

test("junk and too-short values are rejected", () => {
  assert.equal(normalizePhoneE164(""), null);
  assert.equal(normalizePhoneE164("123"), null);
  assert.equal(normalizePhoneE164("not a number"), null);
});

test("US input formatting is reversible", () => {
  assert.equal(formatPhoneForInput("+15551234567"), "(555) 123-4567");
  assert.equal(formatPhoneForInput("+447911123456"), "+447911123456");
  assert.equal(formatPhoneForInput(null), "");
});

test("text is accepted as an alias for sms", () => {
  assert.equal(parseNotifyChannel("text"), "sms");
  assert.equal(parseNotifyChannel("sms"), "sms");
  assert.equal(parseNotifyChannel("both"), "both");
  assert.equal(parseNotifyChannel("nope"), "email");
});

test("channel helpers match the preference", () => {
  assert.equal(wantsEmail("email"), true);
  assert.equal(wantsSms("email"), false);
  assert.equal(wantsEmail("sms"), false);
  assert.equal(wantsSms("sms"), true);
  assert.equal(wantsEmail("both"), true);
  assert.equal(wantsSms("both"), true);
});

test("SMS is not queued until a number exists", () => {
  assert.deepEqual(humanChannelsFor({ channel: "email", phoneE164: null }), [
    "email",
  ]);
  assert.deepEqual(humanChannelsFor({ channel: "sms", phoneE164: null }), []);
  assert.deepEqual(humanChannelsFor({ channel: "both", phoneE164: null }), [
    "email",
  ]);
  assert.deepEqual(
    humanChannelsFor({ channel: "both", phoneE164: "+15551234567" }),
    ["email", "sms"],
  );
  assert.deepEqual(
    humanChannelsFor({ channel: "sms", phoneE164: "+15551234567" }),
    ["sms"],
  );
});

test("follow copy stays specific to the chosen channel", () => {
  assert.match(followCopy("email", false).detail, /email/);
  assert.match(followCopy("sms", false).detail, /text/);
  assert.match(followCopy("both", true).detail, /email and text/);
});
