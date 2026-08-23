import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSageCapability,
  listSageCapabilities,
  SageCapabilityError,
} from "./sage/capabilities";
import {
  safeSageError,
  sageRetryDelayMs,
  shouldSageHandle,
} from "./sage/job-store";
import {
  executeCoordinationCapability,
  getCoordinationCapability,
  CoordinationCapabilityError,
} from "./coordination-capabilities";

test("operator arbitration always honors an explicit ask Sage request", () => {
  assert.equal(
    shouldSageHandle({
      mode: "external_primary",
      trigger: "user_request",
      externalAgentConnected: true,
    }),
    true,
  );
});

test("external primary falls back to Sage only without a connected agent", () => {
  assert.equal(
    shouldSageHandle({
      mode: "external_primary",
      trigger: "scheduled",
      externalAgentConnected: true,
    }),
    false,
  );
  assert.equal(
    shouldSageHandle({
      mode: "external_primary",
      trigger: "scheduled",
      externalAgentConnected: false,
    }),
    true,
  );
});

test("Sage retry delay is bounded exponential backoff", () => {
  assert.equal(sageRetryDelayMs(1), 5_000);
  assert.equal(sageRetryDelayMs(2), 10_000);
  assert.equal(sageRetryDelayMs(99), 30 * 60_000);
});

test("Sage errors are flattened and bounded before persistence", () => {
  const error = safeSageError(new Error(`private\n${"x".repeat(3_000)}`));
  assert.equal(error.includes("\n"), false);
  assert.equal(error.length, 2_000);
});

test("scheduling capability allowlists input and redacts its audit step", () => {
  const capability = getSageCapability("schedule_meeting");
  const parsed = capability.parseInput({
    peerEmails: ["person@example.com"],
    durationMinutes: 30,
    title: "Planning",
    notes: "Private details",
    ignored: "must not cross the boundary",
  });
  assert.equal("ignored" in parsed, false);
  assert.deepEqual(capability.redactInput(parsed), {
    peerCount: 1,
    usesLink: false,
    durationMinutes: 30,
    hasWindow: false,
    hasTitle: true,
    hasNotes: true,
  });
  assert.equal(listSageCapabilities()[0]?.humanApproval, "always");
});

test("unknown Sage capabilities fail without retrying", () => {
  assert.throws(
    () => getSageCapability("send_money"),
    (error: unknown) =>
      error instanceof SageCapabilityError && error.retryable === false,
  );
});

test("Sage and external agents share capability definitions", () => {
  const sharedSchedule = getCoordinationCapability("schedule_meeting");
  const sageSchedule = getSageCapability("schedule_meeting");
  assert.equal(sageSchedule.version, sharedSchedule.version);
  assert.deepEqual(
    sageSchedule.redactInput(
      sageSchedule.parseInput({ peerEmail: "person@example.com" }),
    ),
    sharedSchedule.redactInput(
      sharedSchedule.parseInput({ peerEmail: "person@example.com" }),
    ),
  );

  const discovery = getSageCapability("discovery_search");
  assert.deepEqual(discovery.parseInput({ intentSlug: "dating_introduction" }), {
    intentSlug: "dating_introduction",
    limit: undefined,
  });
  assert.equal(discovery.humanApproval, "never");
});

test("Sage publishes conversational discovery and human-gated handoffs", () => {
  const capabilities = new Map(
    listSageCapabilities().map((capability) => [capability.name, capability]),
  );
  assert.equal(capabilities.size, 5);
  assert.equal(capabilities.get("discovery_intake")?.humanApproval, "never");
  assert.equal(
    capabilities.get("discovery_prepare_enrollment")?.humanApproval,
    "always",
  );
  assert.equal(
    capabilities.get("discovery_stage_introduction")?.humanApproval,
    "always",
  );
});

test("the shared registry enforces external-agent scopes", async () => {
  await assert.rejects(
    executeCoordinationCapability(
      "schedule_meeting",
      {
        actor: {
          user: {} as never,
          mode: "external_agent",
          kind: "agent",
          scopes: [],
        },
      },
      { peerEmail: "person@example.com" },
    ),
    (error: unknown) =>
      error instanceof CoordinationCapabilityError &&
      error.status === 403 &&
      error.details?.requiredScope === "tasks:write",
  );
});
