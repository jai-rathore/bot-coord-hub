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
import { validateCombinedClaims } from "./discovery-service";
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

test("dating contract is adult-only and privately matched", () => {
  assert.equal(DATING_INTRODUCTION_DEFINITION.discovery.enabled, true);
  assert.equal(DATING_INTRODUCTION_DEFINITION.eligibility.minimumAge, 18);
  assert.equal(DATING_INTRODUCTION_DEFINITION.discovery.locationGranularity, "city");
  assert.deepEqual(DATING_INTRODUCTION_DEFINITION.discovery.projectionFields, [
    "relationshipIntent",
  ]);
  const ageField = DATING_INTRODUCTION_DEFINITION.enrollment.fields.find(
    (field) => field.key === "age",
  );
  assert.equal(ageField?.sourcePolicy, "human_only");
  const handler = registeredIntentHandler(DATING_INTRODUCTION_DEFINITION);
  const result = handler({
    seekerClaims: {
      relationshipIntent: "long_term",
      interests: ["hiking", "cooking"],
    },
    candidateClaims: {
      relationshipIntent: "figuring_out",
      interests: ["hiking"],
    },
    seekerLocation: {
      canonicalKey: "geoapify:city:new-york",
      countryCode: "US",
      locality: "New York",
    },
    candidateLocation: {
      canonicalKey: "geoapify:city:new-york",
      countryCode: "US",
      locality: "New York",
    },
  });
  assert.equal(result.verdict, "compatible");
  assert.equal(result.dimensions.location, "compatible");
  assert.equal(result.dimensions.relationshipIntent, "compatible");
  assert.equal("age" in result.dimensions, false);
  const mismatch = handler({
    seekerClaims: {
      relationshipIntent: "long_term",
      interests: ["hiking"],
    },
    candidateClaims: {
      relationshipIntent: "casual",
      interests: ["hiking"],
    },
    seekerLocation: {
      canonicalKey: "geoapify:city:new-york",
      locality: "New York",
    },
    candidateLocation: {
      canonicalKey: "geoapify:city:austin",
      locality: "Austin",
    },
  });
  assert.equal(mismatch.verdict, "incompatible");
  assert.equal(mismatch.dimensions.location, "incompatible");
});

test("missing enrollment questions are derived from the contract", () => {
  const missing = missingEnrollmentFields(HIRING_DISCOVERY_DEFINITION, {
    participantType: "candidate",
  });
  assert.deepEqual(
    missing.map((field) => field.key),
    ["headline"],
  );
  assert.deepEqual(
    missingEnrollmentFields(DATING_INTRODUCTION_DEFINITION, {
      age: 29,
      relationshipIntent: "long_term",
      headline: "Weekend hiker",
      interests: [],
      introductionSummary: "Coffee after a hike",
    }).map((field) => field.key),
    ["interests"],
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

test("city typeahead uses the server-side Geoapify adapter and returns no coordinates", async () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousApiKey = process.env.GEOAPIFY_API_KEY;
  const previousEncryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
  const previousFetch = globalThis.fetch;
  mutableEnv.GEOAPIFY_API_KEY = "test-geoapify-key";
  mutableEnv.TOKEN_ENCRYPTION_KEY =
    "test-location-resolution-key-with-sufficient-entropy";
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.geoapify.com");
    assert.equal(url.searchParams.get("type"), "city");
    assert.ok(
      ["countrycode:us", "countrycode:ca"].includes(
        String(url.searchParams.get("filter")),
      ),
    );
    assert.equal(url.searchParams.get("apiKey"), "test-geoapify-key");
    return new Response(
      JSON.stringify({
        features: [
          {
            properties: {
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
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const result = await resolveLocationSuggestions({
      userId: "user-a",
      query: "New York",
      granularity: "city",
      countryCode: "US",
    });
    assert.equal(result.suggestions[0]?.place.locality, "New York");
    assert.equal("lat" in (result.suggestions[0]?.place ?? {}), false);
    assert.equal(
      result.suggestions[0]?.resolutionToken.includes("New York"),
      false,
    );
    const numericPlaceName = await resolveLocationSuggestions({
      userId: "user-a",
      query: "100 Mile House",
      granularity: "city",
      countryCode: "CA",
    });
    assert.equal(numericPlaceName.suggestions.length, 1);
    await assert.rejects(
      () =>
        resolveLocationSuggestions({
          userId: "user-a",
          query: "40,-74",
          granularity: "city",
        }),
      /coarse place name/,
    );
    for (const privateQuery of [
      "1600 Pennsylvania Avenue",
      "221B Baker Street",
      "1 Microsoft Way",
      "P.O. Box 123",
      "40.7128 -74.0060",
      "40° N, 74° W",
    ]) {
      await assert.rejects(
        () =>
          resolveLocationSuggestions({
            userId: "user-a",
            query: privateQuery,
            granularity: "city",
          }),
        /coarse place name/,
      );
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete mutableEnv.GEOAPIFY_API_KEY;
    else mutableEnv.GEOAPIFY_API_KEY = previousApiKey;
    if (previousEncryptionKey === undefined) {
      delete mutableEnv.TOKEN_ENCRYPTION_KEY;
    } else {
      mutableEnv.TOKEN_ENCRYPTION_KEY = previousEncryptionKey;
    }
  }
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

/* ------------------------------------------------------------------ */
/* claim validation: a closed enum is not free text                   */
/* ------------------------------------------------------------------ */

test("every relationshipIntent option the UI offers is actually accepted", () => {
  // Regression: the anonymous-card content filter treated enum values as free
  // text and rejected any character outside [letters, digits, space, & + , ' -].
  // "long_term" and "figuring_out" contain an underscore, so half of a
  // required field's options were refused in production with the misleading
  // message "relationshipIntent cannot contain contact identifiers".
  const dating = DATING_INTRODUCTION_DEFINITION;
  const field = dating.enrollment.fields.find(
    (f) => f.key === "relationshipIntent",
  )!;
  assert.ok(field.options && field.options.length > 0);

  for (const option of field.options) {
    assert.doesNotThrow(
      () =>
        validateCombinedClaims(dating, {
          age: 28,
          relationshipIntent: option,
          headline: "Weekend hiker",
          interests: ["hiking"],
          introductionSummary: "Happy to grab coffee",
        }),
      `relationshipIntent option "${option}" must be accepted`,
    );
  }
});

test("a value outside the enum is still refused", () => {
  const dating = DATING_INTRODUCTION_DEFINITION;
  assert.throws(
    () =>
      validateCombinedClaims(dating, {
        age: 28,
        relationshipIntent: "whatever_i_typed",
        headline: "Weekend hiker",
        interests: ["hiking"],
        introductionSummary: "Happy to grab coffee",
      }),
    /must be one of/,
  );
});

test("exempting enums does not weaken the filter on free text", () => {
  const dating = DATING_INTRODUCTION_DEFINITION;
  for (const headline of [
    "Reach me at me@example.com",
    "instagram: someone",
    "https://t.me/someone",
    "Call 5551234567 anytime",
  ]) {
    assert.throws(
      () =>
        validateCombinedClaims(dating, {
          age: 28,
          relationshipIntent: "long_term",
          headline,
          interests: ["hiking"],
          introductionSummary: "Happy to grab coffee",
        }),
      /contact identifiers/,
      `"${headline}" must still be refused`,
    );
  }
});

test("an underage claim surfaces the age error, not a content error", () => {
  // With the enum wrongly rejected first, this used to fail on
  // "cannot contain contact identifiers" and the age rule never ran.
  const dating = DATING_INTRODUCTION_DEFINITION;
  assert.throws(
    () =>
      validateCombinedClaims(dating, {
        age: 17,
        relationshipIntent: "long_term",
        headline: "Weekend hiker",
        interests: ["hiking"],
        introductionSummary: "Happy to grab coffee",
      }),
    /18 or older/,
  );
});
