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
import { activityPayloadForTrigger } from "./sage/triggers";
import { validatedDiscoveryCadence } from "./sage/discovery-cadence";
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

test("activity triggers carry the narrowest available domain context", () => {
  assert.deepEqual(
    activityPayloadForTrigger({ eventId: "event-1", sessionId: "session-1" }),
    { action: "event", eventRef: "event-1" },
  );
  assert.deepEqual(activityPayloadForTrigger({ sessionId: "session-1" }), {
    action: "session",
    sessionId: "session-1",
  });
  assert.deepEqual(activityPayloadForTrigger({}), {
    action: "overview",
    pendingOnly: true,
    limit: 20,
  });
});

test("automatic discovery cadence is opt-in and budget bounded", () => {
  assert.deepEqual(validatedDiscoveryCadence({}), {
    intervalHours: 168,
    maxRecommendations: 3,
  });
  assert.deepEqual(
    validatedDiscoveryCadence({ intervalHours: 24, maxRecommendations: 10 }),
    { intervalHours: 24, maxRecommendations: 10 },
  );
  assert.throws(() => validatedDiscoveryCadence({ intervalHours: 12 }));
  assert.throws(() => validatedDiscoveryCadence({ maxRecommendations: 11 }));
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
  assert.equal(capabilities.size, 10);
  assert.equal(capabilities.get("discovery_intake")?.humanApproval, "never");
  assert.equal(
    capabilities.get("discovery_prepare_enrollment")?.humanApproval,
    "always",
  );
  assert.equal(
    capabilities.get("discovery_stage_introduction")?.humanApproval,
    "always",
  );
  const stage = getSageCapability("discovery_stage_introduction");
  assert.deepEqual(stage.parseInput({ recommendationId: "recommendation-1" }), {
    candidateHandle: undefined,
    recommendationId: "recommendation-1",
  });
  assert.throws(() => stage.parseInput({}));
  assert.throws(() =>
    stage.parseInput({
      candidateHandle: `dc_${"a".repeat(40)}`,
      recommendationId: "recommendation-1",
    }),
  );
});

test("Sage publishes bounded outcome capabilities for every remaining stream", () => {
  const capabilities = new Map(
    listSageCapabilities().map((capability) => [capability.name, capability]),
  );
  assert.equal(capabilities.get("coordinate_event")?.humanApproval, "policy");
  assert.equal(capabilities.get("run_guest_request")?.humanApproval, "policy");
  assert.equal(capabilities.get("manage_connections")?.humanApproval, "policy");
  assert.equal(capabilities.get("review_activity")?.humanApproval, "never");
  assert.equal(capabilities.get("event_chat")?.humanApproval, "policy");
});

test("event chat allowlists private input and redacts the model prompt", () => {
  const capability = getSageCapability("event_chat");
  const parsed = capability.parseInput({
    eventId: "event-1",
    message: "Private scheduling constraints",
    role: "organizer",
    ignored: "drop this",
  });
  assert.deepEqual(parsed, {
    eventId: "event-1",
    message: "Private scheduling constraints",
  });
  assert.deepEqual(capability.redactInput(parsed), {
    eventId: "event-1",
    messageLength: 30,
  });
  assert.equal(
    JSON.stringify(capability.redactInput(parsed)).includes("constraints"),
    false,
  );
});

test("event creation is strictly parsed and operationally redacted", () => {
  const capability = getSageCapability("coordinate_event");
  const parsed = capability.parseInput({
    action: "create",
    title: "Sunday picnic",
    description: "Private organizer context",
    fixedStartsAt: "2026-09-06T19:00:00.000Z",
    place: "Lake Merritt",
    ignored: "must not cross the boundary",
  });
  assert.equal("ignored" in parsed, false);
  assert.deepEqual(capability.redactInput(parsed), {
    action: "create",
    archived: null,
    limit: null,
    hasEventRef: false,
    hasTitle: true,
    hasDescription: true,
    slotCount: 0,
    hasFixedTime: true,
    hasPlace: true,
    hasDimensionId: false,
    responseCount: 0,
    hasAttendance: false,
    hasNote: false,
    noteAudience: null,
    hasDeadline: false,
  });
  assert.equal(
    JSON.stringify(capability.redactInput(parsed)).includes("Private"),
    false,
  );
});

test("event lifecycle actions accept only explicit typed human values", () => {
  const capability = getSageCapability("coordinate_event");
  assert.deepEqual(
    capability.parseInput({
      action: "respond",
      eventRef: "event-link",
      entries: [{ optionId: "option-1", value: "yes" }],
      privateProse: "drop this",
    }),
    {
      action: "respond",
      eventRef: "event-link",
      origin: undefined,
      entries: [{ optionId: "option-1", value: "yes" }],
      attendance: undefined,
    },
  );
  assert.deepEqual(
    capability.parseInput({
      action: "post_note",
      eventRef: "event-link",
      body: "I can arrive after six.",
      audience: "organizer",
    }),
    {
      action: "post_note",
      eventRef: "event-link",
      origin: undefined,
      body: "I can arrive after six.",
      audience: "organizer",
      optionId: undefined,
    },
  );
  assert.throws(() =>
    capability.parseInput({
      action: "respond",
      eventRef: "event-link",
      entries: [{ optionId: "option-1", value: "probably" }],
    }),
  );
});

test("human-only event actions are absent from the Sage capability", () => {
  const capability = getSageCapability("coordinate_event");
  for (const action of ["lock", "cancel", "confirm", "book"]) {
    assert.throws(
      () => capability.parseInput({ action }),
      (error: unknown) => error instanceof SageCapabilityError,
    );
  }
});

test("guest, people, and activity capabilities expose only their bounded actions", () => {
  const guest = getSageCapability("run_guest_request");
  assert.deepEqual(guest.parseInput({ action: "review", publicId: "task-1" }), {
    action: "review",
    publicId: "task-1",
  });
  const guestCreate = guest.parseInput({
    action: "create",
    taskType: "hiring_compatibility",
    title: "Product engineer",
    targetEmail: "candidate@example.com",
    privateConfig: { compensationMaximum: 200_000 },
    rawCandidateAnswer: "must be dropped",
  });
  assert.equal("rawCandidateAnswer" in guestCreate, false);
  assert.equal(
    JSON.stringify(guest.redactInput(guestCreate)).includes("candidate@example.com"),
    false,
  );

  const people = getSageCapability("manage_connections");
  assert.deepEqual(people.parseInput({ action: "review", secret: "drop" }), {
    action: "review",
    origin: undefined,
  });
  assert.deepEqual(
    people.parseInput({
      action: "create_invite",
      toEmail: "friend@example.com",
      toName: "Friend",
    }),
    {
      action: "create_invite",
      toEmail: "friend@example.com",
      toName: "Friend",
      confirmRequired: true,
      expiresInHours: 168,
      origin: undefined,
    },
  );
  assert.throws(() => people.parseInput({ action: "approve" }));

  const activity = getSageCapability("review_activity");
  assert.deepEqual(activity.parseInput({ pendingOnly: true, limit: 8, x: 1 }), {
    action: "overview",
    pendingOnly: true,
    limit: 8,
  });
  assert.deepEqual(
    activity.parseInput({ action: "session", sessionId: "session-1" }),
    { action: "session", sessionId: "session-1" },
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
