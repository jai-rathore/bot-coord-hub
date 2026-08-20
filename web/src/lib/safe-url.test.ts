import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  callbackUrlSyntaxAllowed,
  fetchResolvedCallback,
  isBlockedIpAddress,
  isSafeCallbackUrl,
  pinnedLookup,
  resolveSafeCallbackUrl,
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
    callbackUrlSyntaxAllowed("https://[::ffff:7f00:1]/", true),
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

test("pinned lookup never asks DNS and ignores a rebound hostname", () => {
  const lookup = pinnedLookup([{ address: "203.0.113.10", family: 4 }]);
  let address = "";
  let family = 0;
  lookup("hooks.example.com", {}, (err, value, fam) => {
    assert.equal(err, null);
    address = value as string;
    family = fam ?? 0;
  });
  assert.equal(address, "203.0.113.10");
  assert.equal(family, 4);
});

test("delivery POSTs to the resolved address, not a later DNS answer", async () => {
  const seen: string[] = [];
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url} host=${req.headers.host}`);
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  try {
    const resolved = await resolveSafeCallbackUrl(
      `http://hooks.example.com:${port}/inbox`,
      {
        production: false,
        resolve: async () => [{ address: "127.0.0.1" }],
      },
    );
    assert.ok(resolved);
    const response = await fetchResolvedCallback(resolved, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{\"source\":\"honeymatcha\"}",
    });
    assert.equal(response.ok, true);
    assert.equal(await response.text(), "ok");
    assert.deepEqual(seen, [
      `POST /inbox host=hooks.example.com:${port}`,
    ]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
