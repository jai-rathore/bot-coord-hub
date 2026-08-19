import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPABILITIES,
  enabledCapabilities,
  lockedCount,
  stateFor,
} from "./capabilities";

test("your own agent runs every capability", () => {
  for (const capability of CAPABILITIES) {
    assert.equal(
      stateFor(capability, "own"),
      "ready",
      `${capability.id} should be ready for a personal agent`,
    );
  }
});

test("Sage runs only what it has learned", () => {
  for (const capability of CAPABILITIES) {
    assert.equal(stateFor(capability, "sage"), capability.sage);
  }
});

test("at least one capability works with no agent of your own", () => {
  // The signed-out page promises Sage is enough to start. If that stops being
  // true the promise has to change with it.
  assert.ok(CAPABILITIES.some((capability) => capability.sage === "ready"));
});

test("a locked capability is a real one, not a placeholder", () => {
  for (const capability of CAPABILITIES) {
    assert.ok(capability.title.length > 0);
    assert.ok(capability.line.length > 0);
    assert.ok(capability.href.startsWith("/"));
  }
});

test("feature flags hide capabilities a signed-in person cannot reach", () => {
  const all = enabledCapabilities({ events: true, discovery: true });
  assert.equal(all.length, CAPABILITIES.length);

  const noDiscovery = enabledCapabilities({ events: true, discovery: false });
  assert.ok(noDiscovery.every((capability) => capability.flag !== "discovery"));

  const nothing = enabledCapabilities({ events: false, discovery: false });
  assert.ok(nothing.every((capability) => capability.flag === undefined));
});

test("the unlock nudge counts only what an agent would actually add", () => {
  assert.equal(
    lockedCount(CAPABILITIES),
    CAPABILITIES.filter((capability) => capability.sage === "soon").length,
  );
  assert.equal(lockedCount([]), 0);

  // A flag that hides a capability must also drop it from the count, or the
  // home page offers to unlock something it will not then show.
  const eventsOnly = enabledCapabilities({ events: true, discovery: false });
  assert.equal(
    lockedCount(eventsOnly),
    eventsOnly.filter((capability) => capability.sage === "soon").length,
  );
});
