export type CompatibilityState = "compatible" | "incompatible" | "unknown";

export type RoleConstraints = {
  compensationMaximum?: number;
  locations?: string[];
  workModes?: string[];
  sponsorshipAvailable?: boolean;
  latestStart?: string;
  levels?: string[];
};

export type CandidateConstraints = {
  compensationMinimum?: number;
  locations?: string[];
  workModes?: string[];
  sponsorshipRequired?: boolean;
  earliestStart?: string;
  levels?: string[];
};

export type HiringMatchResult = {
  verdict: "compatible" | "incompatible" | "human_review";
  dimensions: Record<
    "compensation" | "location" | "workMode" | "sponsorship" | "timing" | "level",
    CompatibilityState
  >;
  note: string;
};

function overlap(
  left: string[] | undefined,
  right: string[] | undefined,
): CompatibilityState {
  if (!left?.length || !right?.length) return "unknown";
  const normalized = new Set(left.map((value) => value.trim().toLowerCase()));
  return right.some((value) => normalized.has(value.trim().toLowerCase()))
    ? "compatible"
    : "incompatible";
}

export function matchHiringConstraints(
  role: RoleConstraints,
  candidate: CandidateConstraints,
): HiringMatchResult {
  const compensation: CompatibilityState =
    role.compensationMaximum == null ||
    candidate.compensationMinimum == null
      ? "unknown"
      : candidate.compensationMinimum <= role.compensationMaximum
        ? "compatible"
        : "incompatible";
  const sponsorship: CompatibilityState =
    candidate.sponsorshipRequired == null ||
    role.sponsorshipAvailable == null
      ? "unknown"
      : !candidate.sponsorshipRequired || role.sponsorshipAvailable
        ? "compatible"
        : "incompatible";
  const timing: CompatibilityState =
    !candidate.earliestStart || !role.latestStart
      ? "unknown"
      : new Date(candidate.earliestStart) <= new Date(role.latestStart)
        ? "compatible"
        : "incompatible";
  const dimensions = {
    compensation,
    location: overlap(role.locations, candidate.locations),
    workMode: overlap(role.workModes, candidate.workModes),
    sponsorship,
    timing,
    level: overlap(role.levels, candidate.levels),
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
        ? "The submitted hard constraints overlap."
        : verdict === "incompatible"
          ? "At least one hard constraint does not overlap."
          : "No hard mismatch was found, but a person should review missing information.",
  };
}
