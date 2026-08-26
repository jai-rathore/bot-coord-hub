import { iso31661, iso31662 } from "iso-3166";
import { AgentApiError } from "@/lib/agent-errors";
import { decryptJson, encryptJson } from "@/lib/secret-crypto";
import type { LocationGranularity } from "@/lib/intent-contract";

const LOCATION_TOKEN_PREFIX = "hlr_";
const LOCATION_TOKEN_TTL_MS = 30 * 60 * 1000;
const GEOAPIFY_TIMEOUT_MS = 2_500;
const MAX_QUERY_LENGTH = 120;

export type CanonicalLocationGranularity = Exclude<
  LocationGranularity,
  "none"
>;

export type CanonicalLocation = {
  schemaVersion: 1;
  canonicalKey: string;
  provider: "iso3166" | "geoapify";
  providerPlaceId: string;
  granularity: CanonicalLocationGranularity;
  label: string;
  countryCode: string;
  country: string;
  regionCode?: string;
  region?: string;
  locality?: string;
  neighborhood?: string;
  /** City-centroid coordinates used only for coarse distance matching. */
  latitude?: number;
  longitude?: number;
};

export type LocationSuggestion = {
  resolutionToken: string;
  place: CanonicalLocation;
};

type GeoapifyProperties = {
  place_id?: unknown;
  result_type?: unknown;
  formatted?: unknown;
  name?: unknown;
  country?: unknown;
  country_code?: unknown;
  state?: unknown;
  state_code?: unknown;
  county?: unknown;
  city?: unknown;
  suburb?: unknown;
  district?: unknown;
  address_line1?: unknown;
  lat?: unknown;
  lon?: unknown;
};

type GeoapifyResponse = {
  features?: Array<{ properties?: GeoapifyProperties }>;
};

function normalizedSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function searchScore(query: string, candidates: string[]) {
  if (!query) return 1;
  let best = 0;
  for (const candidateValue of candidates) {
    const candidate = normalizedSearchText(candidateValue);
    if (!candidate) continue;
    if (candidate === query) best = Math.max(best, 100);
    else if (candidate.startsWith(query)) best = Math.max(best, 90);
    else if (candidate.includes(query)) best = Math.max(best, 80);
    else if (
      Math.abs(candidate.length - query.length) <= 2 &&
      editDistance(candidate, query) <= 2
    ) {
      best = Math.max(best, 70);
    }
  }
  return best;
}

function countryDisplayName(countryCode: string, fallback: string) {
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ??
      fallback
    );
  } catch {
    return fallback;
  }
}

function countryPlace(countryCode: string): CanonicalLocation | null {
  const country = iso31661.find((item) => item.alpha2 === countryCode);
  if (!country) return null;
  const label = countryDisplayName(country.alpha2, country.name);
  return {
    schemaVersion: 1,
    canonicalKey: `iso3166:${country.alpha2}`,
    provider: "iso3166",
    providerPlaceId: country.alpha2,
    granularity: "country",
    label,
    countryCode: country.alpha2,
    country: label,
  };
}

function regionPlace(regionCode: string): CanonicalLocation | null {
  const region = iso31662.find((item) => item.code === regionCode);
  if (!region) return null;
  const country = countryPlace(region.code.slice(0, 2));
  if (!country) return null;
  return {
    schemaVersion: 1,
    canonicalKey: `iso3166:${region.code}`,
    provider: "iso3166",
    providerPlaceId: region.code,
    granularity: "region",
    label: `${region.name}, ${country.label}`,
    countryCode: country.countryCode,
    country: country.country,
    regionCode: region.code,
    region: region.name,
  };
}

function localSuggestions(
  queryValue: string,
  granularity: "country" | "region",
  countryCode?: string,
) {
  const query = normalizedSearchText(queryValue);
  if (granularity === "country") {
    return iso31661
      .map((country) => {
        const displayName = countryDisplayName(country.alpha2, country.name);
        return {
          score: searchScore(query, [
            displayName,
            country.name,
            country.alpha2,
            country.alpha3,
          ]),
          place: countryPlace(country.alpha2),
        };
      })
      .filter(
        (entry): entry is { score: number; place: CanonicalLocation } =>
          entry.score > 0 && Boolean(entry.place),
      )
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.place.label.localeCompare(right.place.label),
      )
      .map((entry) => entry.place);
  }

  const normalizedCountryCode = countryCode?.trim().toUpperCase();
  if (!normalizedCountryCode || !countryPlace(normalizedCountryCode)) {
    throw new AgentApiError(
      400,
      "A valid ISO alpha-2 countryCode is required for region suggestions",
      { code: "country_required" },
    );
  }
  return iso31662
    .filter((region) => region.code.startsWith(`${normalizedCountryCode}-`))
    .map((region) => ({
      score: searchScore(query, [region.name, region.code]),
      place: regionPlace(region.code),
    }))
    .filter(
      (entry): entry is { score: number; place: CanonicalLocation } =>
        entry.score > 0 && Boolean(entry.place),
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.place.label.localeCompare(right.place.label),
    )
    .map((entry) => entry.place);
}

function propertyText(value: unknown, maximum = 200) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maximum ? text : null;
}

function canonicalRegionCode(countryCode: string, properties: GeoapifyProperties) {
  const stateCode = propertyText(properties.state_code, 20)?.toUpperCase();
  if (
    stateCode &&
    iso31662.some((region) => region.code === `${countryCode}-${stateCode}`)
  ) {
    return `${countryCode}-${stateCode}`;
  }
  const state = propertyText(properties.state);
  if (!state) return undefined;
  const normalizedState = normalizedSearchText(state);
  return iso31662.find(
    (region) =>
      region.code.startsWith(`${countryCode}-`) &&
      normalizedSearchText(region.name) === normalizedState,
  )?.code;
}

export function canonicalLocationFromGeoapify(
  properties: GeoapifyProperties,
  requestedGranularity: "city" | "neighborhood",
): CanonicalLocation | null {
  const providerPlaceId = propertyText(properties.place_id, 300);
  const countryCode = propertyText(properties.country_code, 2)?.toUpperCase();
  const country =
    countryCode &&
    countryPlace(countryCode);
  const resultType = propertyText(properties.result_type, 40);
  if (!providerPlaceId || !countryCode || !country || !resultType) return null;
  if (
    requestedGranularity === "city" &&
    !["city"].includes(resultType)
  ) {
    return null;
  }
  if (
    requestedGranularity === "neighborhood" &&
    !["suburb", "district"].includes(resultType)
  ) {
    return null;
  }

  const region = propertyText(properties.state);
  const regionCode = canonicalRegionCode(countryCode, properties);
  const locality =
    propertyText(properties.city) ??
    (requestedGranularity === "city"
      ? propertyText(properties.name) ??
        propertyText(properties.address_line1)
      : null);
  const neighborhood =
    requestedGranularity === "neighborhood"
      ? propertyText(properties.suburb) ??
        propertyText(properties.district) ??
        propertyText(properties.name) ??
        propertyText(properties.address_line1)
      : undefined;
  if (!locality || (requestedGranularity === "neighborhood" && !neighborhood)) {
    return null;
  }
  const formatted = propertyText(properties.formatted, 300);
  const latitude = Number(properties.lat);
  const longitude = Number(properties.lon);
  const label =
    formatted ??
    [neighborhood, locality, region, country.country]
      .filter(Boolean)
      .join(", ");

  return {
    schemaVersion: 1,
    canonicalKey: `geoapify:${requestedGranularity}:${providerPlaceId}`,
    provider: "geoapify",
    providerPlaceId,
    granularity: requestedGranularity,
    label,
    countryCode,
    country: country.country,
    ...(regionCode ? { regionCode } : {}),
    ...(region ? { region } : {}),
    locality,
    ...(neighborhood ? { neighborhood } : {}),
    ...(Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
      ? { latitude }
      : {}),
    ...(Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
      ? { longitude }
      : {}),
  };
}

function validateCanonicalLocation(value: unknown): CanonicalLocation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentApiError(400, "Location resolution is malformed");
  }
  const place = value as Partial<CanonicalLocation>;
  const validGranularity = ["country", "region", "city", "neighborhood"].includes(
    String(place.granularity),
  );
  const validProvider = ["iso3166", "geoapify"].includes(String(place.provider));
  if (
    place.schemaVersion !== 1 ||
    !validGranularity ||
    !validProvider ||
    typeof place.canonicalKey !== "string" ||
    !place.canonicalKey ||
    typeof place.providerPlaceId !== "string" ||
    !place.providerPlaceId ||
    typeof place.label !== "string" ||
    !place.label ||
    typeof place.countryCode !== "string" ||
    !countryPlace(place.countryCode) ||
    typeof place.country !== "string" ||
    !place.country
  ) {
    throw new AgentApiError(400, "Location resolution is malformed");
  }
  if (
    (place.latitude != null &&
      (typeof place.latitude !== "number" ||
        !Number.isFinite(place.latitude) ||
        place.latitude < -90 ||
        place.latitude > 90)) ||
    (place.longitude != null &&
      (typeof place.longitude !== "number" ||
        !Number.isFinite(place.longitude) ||
        place.longitude < -180 ||
        place.longitude > 180))
  ) {
    throw new AgentApiError(400, "Location coordinates are malformed");
  }
  return place as CanonicalLocation;
}

export function issueLocationResolutionToken(
  userId: string,
  placeValue: CanonicalLocation,
  now = Date.now(),
) {
  const place = validateCanonicalLocation(placeValue);
  return `${LOCATION_TOKEN_PREFIX}${encryptJson({
    tokenType: "location_resolution",
    userId,
    place,
    expiresAt: new Date(now + LOCATION_TOKEN_TTL_MS).toISOString(),
  })}`;
}

export function consumeLocationResolutionToken(
  userId: string,
  tokenValue: unknown,
  requiredGranularity?: CanonicalLocationGranularity,
  now = Date.now(),
) {
  if (
    typeof tokenValue !== "string" ||
    !tokenValue.startsWith(LOCATION_TOKEN_PREFIX)
  ) {
    throw new AgentApiError(400, "A location resolutionToken is required", {
      code: "location_resolution_required",
    });
  }
  let payload: Record<string, unknown>;
  try {
    payload = decryptJson(tokenValue.slice(LOCATION_TOKEN_PREFIX.length));
  } catch {
    throw new AgentApiError(400, "Location resolutionToken is invalid", {
      code: "invalid_location_resolution",
    });
  }
  if (
    payload.tokenType !== "location_resolution" ||
    payload.userId !== userId ||
    typeof payload.expiresAt !== "string" ||
    new Date(payload.expiresAt).getTime() <= now
  ) {
    throw new AgentApiError(400, "Location resolutionToken is invalid or expired", {
      code: "invalid_location_resolution",
    });
  }
  const place = validateCanonicalLocation(payload.place);
  if (requiredGranularity && place.granularity !== requiredGranularity) {
    throw new AgentApiError(
      400,
      `This intent requires ${requiredGranularity} location granularity`,
      { code: "location_granularity_mismatch" },
    );
  }
  return place;
}

async function geoapifySuggestions(
  query: string,
  granularity: "city" | "neighborhood",
  countryCode?: string,
) {
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (!apiKey) {
    throw new AgentApiError(
      503,
      "Location suggestions are temporarily unavailable",
      { code: "location_provider_unavailable" },
    );
  }
  const params = new URLSearchParams({
    text: query,
    type: granularity === "city" ? "city" : "locality",
    format: "geojson",
    limit: "8",
    lang: "en",
    apiKey,
  });
  const normalizedCountryCode = countryCode?.trim().toLowerCase();
  if (normalizedCountryCode) {
    if (!countryPlace(normalizedCountryCode.toUpperCase())) {
      throw new AgentApiError(400, "countryCode must be a valid ISO alpha-2 code");
    }
    params.set("filter", `countrycode:${normalizedCountryCode}`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEOAPIFY_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.geoapify.com/v1/geocode/autocomplete?${params}`,
      {
        headers: { accept: "application/geo+json, application/json" },
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      throw new AgentApiError(
        503,
        "Location suggestions are temporarily unavailable",
        { code: "location_provider_unavailable" },
      );
    }
    const data = (await response.json()) as GeoapifyResponse;
    return (data.features ?? [])
      .map((feature) =>
        canonicalLocationFromGeoapify(
          feature.properties ?? {},
          granularity,
        ),
      )
      .filter((place): place is CanonicalLocation => Boolean(place));
  } catch (error) {
    if (error instanceof AgentApiError) throw error;
    throw new AgentApiError(
      503,
      "Location suggestions are temporarily unavailable",
      { code: "location_provider_unavailable" },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveLocationSuggestions(opts: {
  userId: string;
  query: unknown;
  granularity: unknown;
  countryCode?: unknown;
  limit?: unknown;
}) {
  if (
    typeof opts.granularity !== "string" ||
    !["country", "region", "city", "neighborhood"].includes(opts.granularity)
  ) {
    throw new AgentApiError(
      400,
      "granularity must be country, region, city, or neighborhood",
    );
  }
  const granularity = opts.granularity as CanonicalLocationGranularity;
  const query = typeof opts.query === "string" ? opts.query.trim() : "";
  if (query.length < 2) {
    throw new AgentApiError(400, "query must contain at least 2 characters");
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new AgentApiError(
      400,
      `query must be ${MAX_QUERY_LENGTH} characters or fewer`,
    );
  }
  if (
    /https?:\/\/|www\.|@/i.test(query) ||
    /^\s*[-+]?\d{1,3}(?:\.\d+)?\s*[,/]\s*[-+]?\d{1,3}(?:\.\d+)?\s*$/.test(
      query,
    ) ||
    /^\s*(?:p\.?\s*o\.?\s*box|unit|apt\.?|apartment|suite)\b/i.test(query) ||
    (/^\s*\d{1,6}[a-z]?\s+\S+/i.test(query) &&
      /\b(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|highway|hwy|way|place|pl|terrace|ter|circle|cir|parkway|pkwy)\b\.?/i.test(
        query,
      )) ||
    /^\s*[-+]?\d{1,3}(?:\.\d+)?\s+[-+]?\d{1,3}(?:\.\d+)?\s*$/.test(
      query,
    ) ||
    /(?:\d{1,3}(?:\.\d+)?\s*°|\b[NS]\s*\d{1,3}|\d{1,3}\s*[NS]\b).*(?:\d{1,3}(?:\.\d+)?\s*°|\b[EW]\s*\d{1,3}|\d{1,3}\s*[EW]\b)/i.test(
      query,
    )
  ) {
    throw new AgentApiError(
      400,
      "Use only a coarse place name, not an address, URL, contact, or coordinates",
      { code: "coarse_location_required" },
    );
  }
  const countryCode =
    typeof opts.countryCode === "string" ? opts.countryCode : undefined;
  const limit =
    typeof opts.limit === "number" && Number.isFinite(opts.limit)
      ? Math.min(Math.max(Math.floor(opts.limit), 1), 8)
      : 5;
  const places =
    granularity === "country" || granularity === "region"
      ? localSuggestions(query, granularity, countryCode)
      : await geoapifySuggestions(query, granularity, countryCode);
  return {
    attribution:
      granularity === "country" || granularity === "region"
        ? "ISO 3166"
        : "Powered by Geoapify; © OpenStreetMap contributors",
    suggestions: places.slice(0, limit).map((place) => {
      const publicPlace = { ...place };
      delete publicPlace.latitude;
      delete publicPlace.longitude;
      return {
        place: publicPlace,
        // The signed token keeps only a city centroid for server-side vicinity
        // matching. Coordinates are never returned to the browser.
        resolutionToken: issueLocationResolutionToken(opts.userId, place),
      };
    }),
  };
}
