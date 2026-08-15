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
import { distributedRateLimit } from "./distributed-rate-limit";
import { jsonFromAgentError } from "./http";
import {
  canonicalLocationFromGeoapify,
  consumeLocationResolutionToken,
  issueLocationResolutionToken,
  resolveLocationSuggestions,
  type CanonicalLocation,
} from "./location-resolver";

const NEW_YORK: CanonicalLocation = {
  schemaVersion: 1,
  canonicalKey: "geoapify:city:new-york",
  provider: "geoapify",
  providerPlaceId: "new-york",
  granularity: "city",
  label: "New York, NY, United States",
  countryCode: "US",
  country: "United States",
  regionCode: "US-NY",
  region: "New York",
  locality: "New York",
};

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
      locations: [NEW_YORK],
      workModes: ["hybrid"],
      sponsorshipRequired: true,
      levels: ["senior"],
    },
    candidateClaims: {
      participantType: "employer",
      compensationMaximum: 180_000,
      locations: [NEW_YORK],
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

test("local ISO resolver canonicalizes aliases and minor country typos", async () => {
  const byCode = await resolveLocationSuggestions({
    userId: "user-a",
    query: "USA",
    granularity: "country",
  });
  const byTypo = await resolveLocationSuggestions({
    userId: "user-a",
    query: "Inited States",
    granularity: "country",
  });
  assert.equal(byCode.suggestions[0]?.place.countryCode, "US");
  assert.equal(byTypo.suggestions[0]?.place.countryCode, "US");
  assert.equal(byCode.attribution, "ISO 3166");
});

test("Geoapify normalization omits coordinates and creates canonical hierarchy", () => {
  const place = canonicalLocationFromGeoapify(
    {
      place_id: "geo-place-1",
      result_type: "city",
      formatted: "New York, NY, United States",
      country: "United States",
      country_code: "us",
      state: "New York",
      state_code: "NY",
      city: "New York",
      lat: 40.7,
      lon: -74,
    } as Record<string, unknown>,
    "city",
  );
  assert.equal(place?.countryCode, "US");
  assert.equal(place?.regionCode, "US-NY");
  assert.equal(place?.canonicalKey, "geoapify:city:geo-place-1");
  assert.equal("lat" in (place ?? {}), false);
  assert.equal("lon" in (place ?? {}), false);
});

test("location resolution tokens are encrypted, user-bound, and expiring", () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousKey = process.env.TOKEN_ENCRYPTION_KEY;
  mutableEnv.TOKEN_ENCRYPTION_KEY =
    "test-location-resolution-key-with-sufficient-entropy";
  try {
    const token = issueLocationResolutionToken("user-a", NEW_YORK, 1_000);
    assert.equal(token.includes("New York"), false);
    assert.deepEqual(
      consumeLocationResolutionToken("user-a", token, "city", 2_000),
      NEW_YORK,
    );
    assert.throws(
      () => consumeLocationResolutionToken("user-b", token, "city", 2_000),
      /invalid or expired/,
    );
    assert.throws(
      () =>
        consumeLocationResolutionToken(
          "user-a",
          token,
          "city",
          31 * 60 * 1000,
        ),
      /invalid or expired/,
    );
  } finally {
    if (previousKey === undefined) delete mutableEnv.TOKEN_ENCRYPTION_KEY;
    else mutableEnv.TOKEN_ENCRYPTION_KEY = previousKey;
  }
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
      canonicalKey: "geoapify:neighborhood:park-slope",
      countryCode: "US",
      region: "NY",
      locality: "Brooklyn",
      neighborhood: "Park Slope",
    },
    candidateLocation: {
      canonicalKey: "geoapify:neighborhood:park-slope",
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

test("production discovery limiter fails closed quickly", async () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRedisUrl = process.env.REDIS_URL;
  mutableEnv.NODE_ENV = "production";
  mutableEnv.REDIS_URL = "redis://127.0.0.1:1";
  const startedAt = Date.now();
  try {
    await assert.rejects(
      () => distributedRateLimit("unreachable-test", 1),
      /temporarily unavailable/,
    );
    assert.ok(Date.now() - startedAt < 5_000);
  } finally {
    if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previousNodeEnv;
    if (previousRedisUrl === undefined) delete mutableEnv.REDIS_URL;
    else mutableEnv.REDIS_URL = previousRedisUrl;
  }
});

test("unexpected agent errors never expose SQL parameters", async () => {
  const response = jsonFromAgentError(
    new Error(
      'Failed query: insert into discovery_interests params: ["user-secret-id",{"verdict":"compatible"}]',
    ),
  );
  const body = (await response.json()) as { error: string };
  assert.equal(response.status, 500);
  assert.equal(body.error, "Internal server error");
  assert.equal(JSON.stringify(body).includes("user-secret-id"), false);
  assert.equal(JSON.stringify(body).includes("compatible"), false);
});
