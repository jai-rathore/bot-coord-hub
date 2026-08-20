import assert from "node:assert/strict";
import test from "node:test";

import { canRunIntentTriage } from "./intent-moderation";
import {
  intentsForViewer,
  stripIntentTriage,
  type IntentRegistryItem,
} from "./intents";

function item(
  extra: Partial<IntentRegistryItem> = {},
): IntentRegistryItem {
  return {
    id: "i1",
    source: "proposal",
    slug: "coffee",
    name: "Coffee",
    description: "Find a time",
    status: "pending",
    rejectionReason: "too vague",
    triageRecommendation: "publish",
    triageReason: "matches an existing live type",
    triagedAt: new Date("2026-01-01T00:00:00Z"),
    proposedByUserId: "user-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    definitionVersion: null,
    definition: null,
    discoveryEnabled: false,
    handler: null,
    ...extra,
  };
}

function user(email: string): { email: string } {
  return { email };
}

test("stripIntentTriage drops LLM and proposer internals", () => {
  const stripped = stripIntentTriage(item());
  assert.equal(stripped.triageRecommendation, null);
  assert.equal(stripped.triageReason, null);
  assert.equal(stripped.triagedAt, null);
  assert.equal(stripped.proposedByUserId, null);
  assert.equal(stripped.rejectionReason, null);
  assert.equal(stripped.name, "Coffee");
});

test("unsigned viewers only see live intents without triage internals", () => {
  const rows = [
    item({ status: "live", slug: "live-1" }),
    item({ status: "pending", slug: "pend-1" }),
    item({ status: "rejected", slug: "rej-1" }),
  ];
  const visible = intentsForViewer(rows, { signedIn: false, admin: false });
  assert.deepEqual(
    visible.map((row) => row.slug),
    ["live-1"],
  );
  assert.equal(visible[0].triageRecommendation, null);
  assert.equal(visible[0].proposedByUserId, null);
});

test("signed-in non-admins keep pending rows but lose triage internals", () => {
  const rows = [item({ status: "pending" })];
  const visible = intentsForViewer(rows, { signedIn: true, admin: false });
  assert.equal(visible.length, 1);
  assert.equal(visible[0].status, "pending");
  assert.equal(visible[0].triageRecommendation, null);
});

test("admins see the full registry including triage", () => {
  const rows = [item()];
  const visible = intentsForViewer(rows, { signedIn: true, admin: true });
  assert.equal(visible[0].triageRecommendation, "publish");
  assert.equal(visible[0].proposedByUserId, "user-1");
});

test("production triage fails closed when no admin list is set", () => {
  const ada = user("ada@example.com");
  assert.equal(
    canRunIntentTriage(ada, { production: true, adminEmails: "" }),
    false,
  );
  assert.equal(
    canRunIntentTriage(ada, { production: false, adminEmails: "" }),
    true,
  );
  assert.equal(
    canRunIntentTriage(ada, {
      production: true,
      adminEmails: "ada@example.com",
    }),
    true,
  );
  assert.equal(
    canRunIntentTriage(ada, {
      production: true,
      adminEmails: "other@example.com",
    }),
    false,
  );
});
