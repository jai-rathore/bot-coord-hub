import assert from "node:assert/strict";
import test from "node:test";
import { isSetupComplete, isVisibleHomeTask } from "./home-status";

test("setup is complete only with a connected calendar and a used agent key", () => {
  assert.equal(
    isSetupComplete({
      calendarConnected: true,
      agent: { connected: true },
    }),
    true,
  );
  assert.equal(
    isSetupComplete({
      calendarConnected: true,
      agent: { connected: false },
    }),
    false,
  );
  assert.equal(
    isSetupComplete({
      calendarConnected: false,
      agent: { connected: true },
    }),
    false,
  );
});

test("home and task lists hide stopped leftover work", () => {
  assert.equal(isVisibleHomeTask("open"), true);
  assert.equal(isVisibleHomeTask("confirmed"), true);
  assert.equal(isVisibleHomeTask("cancelled"), false);
  assert.equal(isVisibleHomeTask("declined"), false);
});
