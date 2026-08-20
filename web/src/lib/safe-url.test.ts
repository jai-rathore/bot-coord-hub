import assert from "node:assert/strict";
import test from "node:test";
import {
  callbackUrlSyntaxAllowed,
  isBlockedIpAddress,
  isSafeCallbackUrl,
} from "./safe-url";

test("blocks loopback, RFC1918, link-local, and IPv6-mapped forms", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.8",
    "192.168.1.1",
    "172.16.0.4",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:a9fe:a9fe",
  ]) {
    assert.equal(isBlockedIpAddress(ip), true, ip);
  }
  assert.equal(isBlockedIpAddress("8.8.8.8"), false);
  assert.equal(isBlockedIpAddress("1.1.1.1"), false);
});

test("production syntax rejects http, localhost, and private literals", () => {
  assert.equal(
    callbackUrlSyntaxAllowed("https://hooks.example.com/inbox", true),
    true,
  );
  assert.equal(callbackUrlSyntaxAllowed("http://hooks.example.com/inbox", true), false);
  assert.equal(callbackUrlSyntaxAllowed("https://127.0.0.1/", true), false);
  assert.equal(
    callbackUrlSyntaxAllowed("https://[::ffff:127.0.0.1]/", true),
    false,
  );
  assert.equal(
    callbackUrlSyntaxAllowed("https://[::ffff:169.254.169.254]/", true),
    false,
  );
  assert.equal(callbackUrlSyntaxAllowed("https://localhost/inbox", true), false);
});

test("resolves hostnames at check time so nip.io and rebinding fail closed", async () => {
  const blocked = await isSafeCallbackUrl("https://169-254-169-254.nip.io/", {
    production: true,
    resolve: async () => [{ address: "169.254.169.254" }],
  });
  assert.equal(blocked, false);

  const rebound = await isSafeCallbackUrl("https://hooks.example.com/inbox", {
    production: true,
    resolve: async () => [{ address: "127.0.0.1" }],
  });
  assert.equal(rebound, false);

  const publicOk = await isSafeCallbackUrl("https://hooks.example.com/inbox", {
    production: true,
    resolve: async () => [{ address: "203.0.113.10" }],
  });
  assert.equal(publicOk, true);

  const unresolved = await isSafeCallbackUrl("https://no-such.example/", {
    production: true,
    resolve: async () => {
      throw new Error("ENOTFOUND");
    },
  });
  assert.equal(unresolved, false);
});
