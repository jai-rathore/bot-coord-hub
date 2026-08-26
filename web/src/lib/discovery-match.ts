import {
  matchHiringConstraints,
  type CandidateConstraints,
  type HiringLocation,
  type RoleConstraints,
} from "@/lib/hiring-match";
import type {
  IntentDefinition,
  IntentHandlerId,
} from "@/lib/intent-contract";

export type DiscoveryLocation = {
  canonicalKey?: string | null;
  countryCode?: string | null;
  region?: string | null;
  locality?: string | null;
  neighborhood?: string | null;
};

export type DiscoveryMatchInput = {
  seekerClaims: Record<string, unknown>;
  candidateClaims: Record<string, unknown>;
  seekerLocation?: DiscoveryLocation | null;
  candidateLocation?: DiscoveryLocation | null;
};

export type DiscoveryMatchResult = {
  verdict: "compatible" | "incompatible" | "human_review";
  dimensions: Record<string, "compatible" | "incompatible" | "unknown">;
  note: string;
};

export type DiscoveryMatchHandler = (
  input: DiscoveryMatchInput,
) => DiscoveryMatchResult;

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function hiringLocations(value: unknown): HiringLocation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const locations = value
    .map((item) => {
      if (typeof item === "string") return item;
      if (
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        (typeof (item as Record<string, unknown>).canonicalKey === "string" ||
          typeof (item as Record<string, unknown>).label === "string")
      ) {
        const location = item as Record<string, unknown>;
        return {
          ...(typeof location.canonicalKey === "string"
            ? { canonicalKey: location.canonicalKey }
            : {}),
          ...(typeof location.label === "string" ? { label: location.label } : {}),
          ...(typeof location.latitude === "number"
            ? { latitude: location.latitude }
            : {}),
          ...(typeof location.longitude === "number"
            ? { longitude: location.longitude }
            : {}),
        };
      }
      return null;
    })
    .filter((item): item is HiringLocation => Boolean(item));
  return locations.length ? locations : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function roleConstraints(claims: Record<string, unknown>): RoleConstraints {
  return {
    compensationMaximum: numberValue(claims.compensationMaximum),
    compensationCurrency: stringValue(claims.compensationCurrency),
    equityMaximumPercent: numberValue(claims.equityMaximumPercent),
    locations: hiringLocations(claims.locations),
    locationRadiusMiles: numberValue(claims.locationRadiusMiles),
    workModes: strings(claims.workModes),
    employmentTypes: strings(claims.employmentTypes),
    sponsorshipAvailable: booleanValue(claims.sponsorshipAvailable),
    latestStart: stringValue(claims.latestStart),
    levels: strings(claims.levels),
    roleFocus: strings(claims.roleFocus),
  };
}

function candidateConstraints(
  claims: Record<string, unknown>,
): CandidateConstraints {
  return {
    compensationMinimum: numberValue(claims.compensationMinimum),
    compensationCurrency: stringValue(claims.compensationCurrency),
    equityMinimumPercent: numberValue(claims.equityMinimumPercent),
    locations: hiringLocations(claims.locations),
    locationRadiusMiles: numberValue(claims.locationRadiusMiles),
    workModes: strings(claims.workModes),
    employmentTypes: strings(claims.employmentTypes),
    sponsorshipRequired: booleanValue(claims.sponsorshipRequired),
    earliestStart: stringValue(claims.earliestStart),
    levels: strings(claims.levels),
    roleFocus: strings(claims.roleFocus),
  };
}

const hiringHandler: DiscoveryMatchHandler = ({
  seekerClaims,
  candidateClaims,
}) => {
  const seekerType = seekerClaims.participantType;
  const candidateType = candidateClaims.participantType;
  if (
    !["candidate", "employer"].includes(String(seekerType)) ||
    !["candidate", "employer"].includes(String(candidateType)) ||
    seekerType === candidateType
  ) {
    return {
      verdict: "incompatible",
      dimensions: { participantType: "incompatible" },
      note: "Recruiting discovery requires one candidate and one employer.",
    };
  }
  const employer =
    seekerType === "employer" ? seekerClaims : candidateClaims;
  const candidate =
    seekerType === "candidate" ? seekerClaims : candidateClaims;
  return matchHiringConstraints(
    roleConstraints(employer),
    candidateConstraints(candidate),
  );
};

function normalizedSet(value: unknown): Set<string> {
  return new Set(
    (strings(value) ?? [])
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function overlapState(
  left: unknown,
  right: unknown,
): "compatible" | "incompatible" | "unknown" {
  const a = normalizedSet(left);
  const b = normalizedSet(right);
  if (!a.size || !b.size) return "unknown";
  return [...a].some((value) => b.has(value))
    ? "compatible"
    : "incompatible";
}

function locationState(
  left?: DiscoveryLocation | null,
  right?: DiscoveryLocation | null,
): "compatible" | "incompatible" | "unknown" {
  if (!left || !right) return "unknown";
  if (left.canonicalKey && right.canonicalKey) {
    return left.canonicalKey === right.canonicalKey
      ? "compatible"
      : "incompatible";
  }
  const pairs: Array<[string | null | undefined, string | null | undefined]> = [
    [left.neighborhood, right.neighborhood],
    [left.locality, right.locality],
    [left.region, right.region],
    [left.countryCode, right.countryCode],
  ];
  for (const [a, b] of pairs) {
    if (!a || !b) continue;
    return a.trim().toLowerCase() === b.trim().toLowerCase()
      ? "compatible"
      : "incompatible";
  }
  return "unknown";
}

function meetupRolesCompatible(left: unknown, right: unknown) {
  const hosts = new Set(["host", "both"]);
  const attendees = new Set(["attendee", "both"]);
  const a = String(left);
  const b = String(right);
  return (
    (hosts.has(a) && attendees.has(b)) || (hosts.has(b) && attendees.has(a))
  );
}

const localMeetupHandler: DiscoveryMatchHandler = ({
  seekerClaims,
  candidateClaims,
  seekerLocation,
  candidateLocation,
}) => {
  const dimensions = {
    participantType: meetupRolesCompatible(
      seekerClaims.participantType,
      candidateClaims.participantType,
    )
      ? ("compatible" as const)
      : ("incompatible" as const),
    interests: overlapState(seekerClaims.interests, candidateClaims.interests),
    timeWindow: overlapState(
      seekerClaims.timeWindows,
      candidateClaims.timeWindows,
    ),
    location: locationState(seekerLocation, candidateLocation),
  };
  const values = Object.values(dimensions);
  const verdict = values.includes("incompatible")
    ? "incompatible"
    : values.includes("unknown")
      ? "human_review"
      : "compatible";
  return {
    verdict,
    dimensions,
    note:
      verdict === "compatible"
        ? "Interests, broad timing, and coarse location overlap."
        : verdict === "incompatible"
          ? "At least one required meetup constraint does not overlap."
          : "No hard mismatch was found, but more information is needed.",
  };
};

function datingIntentState(
  left: unknown,
  right: unknown,
): "compatible" | "incompatible" | "unknown" {
  const a = stringValue(left);
  const b = stringValue(right);
  if (!a || !b) return "unknown";
  if (a === "figuring_out" || b === "figuring_out" || a === b) {
    return "compatible";
  }
  return "incompatible";
}

const datingHandler: DiscoveryMatchHandler = ({
  seekerClaims,
  candidateClaims,
  seekerLocation,
  candidateLocation,
}) => {
  const dimensions = {
    relationshipIntent: datingIntentState(
      seekerClaims.relationshipIntent,
      candidateClaims.relationshipIntent,
    ),
    interests: overlapState(seekerClaims.interests, candidateClaims.interests),
    location: locationState(seekerLocation, candidateLocation),
  };
  const values = Object.values(dimensions);
  const verdict = values.includes("incompatible")
    ? "incompatible"
    : values.includes("unknown")
      ? "human_review"
      : "compatible";
  return {
    verdict,
    dimensions,
    note:
      verdict === "compatible"
        ? "Relationship intent, interests, and city overlap."
        : verdict === "incompatible"
          ? "At least one required dating constraint does not overlap."
          : "No hard mismatch was found, but more information is needed.",
  };
};

const HANDLERS: Partial<Record<IntentHandlerId, DiscoveryMatchHandler>> = {
  hiring_v1: hiringHandler,
  local_meetup_v1: localMeetupHandler,
  dating_v1: datingHandler,
};

/** Resolve only audited code handlers; database definitions cannot add code. */
export function registeredIntentHandler(
  definition: IntentDefinition,
): DiscoveryMatchHandler {
  const handler = HANDLERS[definition.discovery.handler];
  if (!handler || !definition.discovery.enabled) {
    throw new Error(
      `Intent discovery handler is disabled or unregistered: ${definition.discovery.handler}`,
    );
  }
  return handler;
}

export function registeredHandlerIds(): string[] {
  return Object.keys(HANDLERS);
}
