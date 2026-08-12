import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { ABOUT_JSON } from "../src/about.js";
import { startServer } from "../src/server.js";

describe("GET / public about", () => {
  let baseUrl = "";
  let server: ReturnType<typeof startServer>;

  before(async () => {
    server = startServer(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("returns HTML about page without auth", async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const ct = res.headers.get("content-type") ?? "";
    assert.match(ct, /text\/html/);
    const html = await res.text();
    assert.match(html, /Bot Coord/);
    assert.match(html, /id="bot-coord-about"/);
    assert.match(html, /bot-coord-hub/);
    assert.match(html, /\/health/);
  });

  it("returns about JSON when Accept: application/json", async () => {
    const res = await fetch(`${baseUrl}/`, {
      headers: { Accept: "application/json" },
    });
    assert.equal(res.status, 200);
    const ct = res.headers.get("content-type") ?? "";
    assert.match(ct, /application\/json/);
    const body = (await res.json()) as typeof ABOUT_JSON;
    assert.deepEqual(body, ABOUT_JSON);
  });

  it("keeps /health public and API routes authenticated", async () => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    const healthBody = (await health.json()) as { ok: boolean };
    assert.equal(healthBody.ok, true);

    const me = await fetch(`${baseUrl}/v1/me`);
    assert.equal(me.status, 401);
  });
});
