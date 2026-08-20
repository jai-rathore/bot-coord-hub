import assert from "node:assert/strict";
import test from "node:test";
import { identityIsStale, identityRefreshWindowMs } from "./identity-refresh";

test("identity refresh window falls back when env is empty or invalid", () => {
  assert.equal(identityRefreshWindowMs(undefined), 10 * 60 * 1000);
  assert.equal(identityRefreshWindowMs(""), 10 * 60 * 1000);
  assert.equal(identityRefreshWindowMs("   "), 10 * 60 * 1000);
  assert.equal(identityRefreshWindowMs("not-a-number"), 10 * 60 * 1000);
  assert.equal(identityRefreshWindowMs("0"), 10 * 60 * 1000);
  assert.equal(identityRefreshWindowMs("-5"), 10 * 60 * 1000);
  assert.equal(identityRefreshWindowMs("60000"), 60_000);
});

test("identity is stale after the refresh window", () => {
  const now = Date.parse("2026-08-20T12:00:00.000Z");
  const windowMs = 10 * 60 * 1000;
  assert.equal(
    identityIsStale(
      { updatedAt: new Date("2026-08-20T11:50:01.000Z") },
      now,
      windowMs,
    ),
    false,
  );
  assert.equal(
    identityIsStale(
      { updatedAt: new Date("2026-08-20T11:49:59.000Z") },
      now,
      windowMs,
    ),
    true,
  );
});

test("identity staleness accepts ISO strings and treats bad dates as stale", () => {
  const now = Date.parse("2026-08-20T12:00:00.000Z");
  assert.equal(
    identityIsStale(
      { updatedAt: "2026-08-20T11:55:00.000Z" },
      now,
      10 * 60 * 1000,
    ),
    false,
  );
  assert.equal(
    identityIsStale({ updatedAt: "not-a-date" }, now, 10 * 60 * 1000),
    true,
  );
});
