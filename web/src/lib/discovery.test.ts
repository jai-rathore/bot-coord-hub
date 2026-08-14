import assert from "node:assert/strict";
import test from "node:test";
import {
  DATING_INTRODUCTION_DEFINITION,
  HIRING_DISCOVERY_DEFINITION,
  LOCAL_MEETUP_DEFINITION,
} from "./intent-definitions";
import {
  missingEnrollmentFields,
  validateIntentDefinition,
} from "./intent-contract";
import { registeredIntentHandler } from "./discovery-match";
import { decryptJson, encryptJson } from "./secret-crypto";

test("canonical discovery definitions enforce staged disclosure", () => {
  for (const definition of [
    HIRING_DISCOVERY_DEFINITION,
    LOCAL_MEETUP_DEFINITION,
    DATING_INTRODUCTION_DEFINITION,
  ]) {
    assert.equal(definition.disclosure.requiresMutualInterest, true);
    assert.equal(definition.disclosure.requiresHumanConfirmation, true);
    assert.equal(definition.safety.blockingRequired, true);
    assert.equal(definition.safety.reportingRequired, true);
  }
});

test("private fields cannot appear on anonymous discovery cards", () => {
  assert.throws(
    () =>
      validateIntentDefinition({
        ...HIRING_DISCOVERY_DEFINITION,
        discovery: {
          ...HIRING_DISCOVERY_DEFINITION.discovery,
          projectionFields: ["compensationMinimum"],
        },
      }),
    /only include discoverable fields/,
  );
});

test("dating contract is adult-only and disabled", () => {
  assert.equal(DATING_INTRODUCTION_DEFINITION.discovery.enabled, false);
  assert.equal(DATING_INTRODUCTION_DEFINITION.eligibility.minimumAge, 18);
  assert.throws(
    () => registeredIntentHandler(DATING_INTRODUCTION_DEFINITION),
    /disabled or unregistered/,
  );
});

test("missing enrollment questions are derived from the contract", () => {
  const missing = missingEnrollmentFields(HIRING_DISCOVERY_DEFINITION, {
    participantType: "candidate",
  });
  assert.deepEqual(
    missing.map((field) => field.key),
    ["headline"],
  );
});

test("hiring discovery returns compatibility dimensions without raw values", () => {
  const handler = registeredIntentHandler(HIRING_DISCOVERY_DEFINITION);
  const result = handler({
    seekerClaims: {
      participantType: "candidate",
      compensationMinimum: 160_000,
      locations: ["New York"],
      workModes: ["hybrid"],
      sponsorshipRequired: true,
      levels: ["senior"],
    },
    candidateClaims: {
      participantType: "employer",
      compensationMaximum: 180_000,
      locations: ["New York"],
      workModes: ["hybrid"],
      sponsorshipAvailable: true,
      levels: ["senior"],
    },
  });
  assert.equal(result.verdict, "human_review");
  assert.equal(result.dimensions.compensation, "compatible");
  assert.equal("compensationMinimum" in result, false);
  assert.equal("compensationMaximum" in result, false);
});

test("local meetup matching uses coarse location and never coordinates", () => {
  const handler = registeredIntentHandler(LOCAL_MEETUP_DEFINITION);
  const result = handler({
    seekerClaims: {
      participantType: "attendee",
      interests: ["board games"],
      timeWindows: ["saturday afternoon"],
    },
    candidateClaims: {
      participantType: "host",
      interests: ["board games", "coffee"],
      timeWindows: ["saturday afternoon"],
    },
    seekerLocation: {
      countryCode: "US",
      region: "NY",
      locality: "Brooklyn",
      neighborhood: "Park Slope",
    },
    candidateLocation: {
      countryCode: "US",
      region: "NY",
      locality: "Brooklyn",
      neighborhood: "Park Slope",
    },
  });
  assert.equal(result.verdict, "compatible");
  assert.equal(result.dimensions.location, "compatible");
  assert.equal(
    "latitude" in (result as unknown as Record<string, unknown>),
    false,
  );
});

test("private discovery claims use authenticated encryption", () => {
  process.env.TOKEN_ENCRYPTION_KEY =
    "test-discovery-encryption-key-with-sufficient-entropy";
  const encrypted = encryptJson({
    compensationMinimum: 175_000,
    socialSource: "human-approved",
  });
  assert.equal(encrypted.includes("175000"), false);
  assert.deepEqual(decryptJson(encrypted), {
    compensationMinimum: 175_000,
    socialSource: "human-approved",
  });
});
