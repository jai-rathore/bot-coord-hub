export type CompatibilityState = "compatible" | "incompatible" | "unknown";

export const HIRING_DIMENSIONS = [
  "company",
  "role",
  "compensation",
  "equity",
  "location",
  "workMode",
  "employmentType",
  "sponsorship",
  "timing",
  "level",
] as const;

export type HiringDimension = (typeof HIRING_DIMENSIONS)[number];
export type HiringInterest = "interested" | "open" | "not_interested";
export type HiringSharingMode = "gaps_only" | "exact_expectations";
export type HiringConversationSignal =
  | "ready_if_aligned"
  | "open_to_revision"
  | "not_interested";

export type HiringLocation =
  | string
  | {
      canonicalKey?: string;
      label?: string;
      latitude?: number;
      longitude?: number;
    };

export type RoleConstraints = {
  companyName?: string;
  roleTitle?: string;
  compensationMaximum?: number;
  compensationCurrency?: string;
  equityMaximumPercent?: number;
  locations?: HiringLocation[];
  locationRadiusMiles?: number;
  workModes?: string[];
  employmentTypes?: string[];
  sponsorshipAvailable?: boolean;
  latestStart?: string;
  levels?: string[];
  roleFocus?: string[];
};

export type CandidateConstraints = {
  companyInterest?: HiringInterest;
  roleInterest?: HiringInterest;
  compensationMinimum?: number;
  compensationCurrency?: string;
  equityMinimumPercent?: number;
  locations?: HiringLocation[];
  locationRadiusMiles?: number;
  workModes?: string[];
  employmentTypes?: string[];
  sponsorshipRequired?: boolean;
  earliestStart?: string;
  levels?: string[];
  roleFocus?: string[];
  sharingMode?: HiringSharingMode;
  priorityDimensions?: HiringDimension[];
  recruiterMayRevise?: boolean;
  conversationSignal?: HiringConversationSignal;
  approvedNote?: string;
};

export type HiringGap = {
  dimension: HiringDimension;
  message: string;
  recruiterCanAdjust: boolean;
};

export type HiringMatchResult = {
  verdict: "compatible" | "incompatible" | "human_review";
  alignment:
    | "ready_for_intro"
    | "aligned"
    | "revisable"
    | "not_aligned"
    | "needs_information";
  dimensions: Record<HiringDimension, CompatibilityState>;
  gaps: HiringGap[];
  candidateSignal: HiringConversationSignal | "unspecified";
  recruiterMayRevise: boolean;
  nextStep: string;
  note: string;
  shareableExpectations?: Record<string, unknown>;
};

const GAP_COPY: Record<
  HiringDimension,
  { message: string; recruiterCanAdjust: boolean }
> = {
  company: {
    message: "The candidate is not currently interested in this company.",
    recruiterCanAdjust: false,
  },
  role: {
    message: "The position or its scope does not match what the candidate wants.",
    recruiterCanAdjust: true,
  },
  compensation: {
    message: "The compensation range does not meet the candidate's approved floor.",
    recruiterCanAdjust: true,
  },
  equity: {
    message: "The equity range does not meet the candidate's approved floor.",
    recruiterCanAdjust: true,
  },
  location: {
    message: "The available locations do not overlap.",
    recruiterCanAdjust: true,
  },
  workMode: {
    message: "The remote, hybrid, or onsite expectations do not overlap.",
    recruiterCanAdjust: true,
  },
  employmentType: {
    message: "The full-time, contract, part-time, or internship expectations do not overlap.",
    recruiterCanAdjust: true,
  },
  sponsorship: {
    message: "The role cannot currently meet the candidate's sponsorship need.",
    recruiterCanAdjust: true,
  },
  timing: {
    message: "The role and candidate start windows do not overlap.",
    recruiterCanAdjust: true,
  },
  level: {
    message: "The role level does not overlap with the candidate's target level.",
    recruiterCanAdjust: true,
  },
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

function locationKey(value: HiringLocation) {
  if (typeof value === "string") return value.trim().toLowerCase();
  return (value.canonicalKey ?? value.label ?? "").trim().toLowerCase();
}

function coordinates(value: HiringLocation) {
  if (
    typeof value !== "string" &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude)
  ) {
    return { latitude: value.latitude, longitude: value.longitude };
  }
  return null;
}

function milesBetween(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(left.latitude)) *
      Math.cos(radians(right.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 3_958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function locationOverlap(
  roleLocations: HiringLocation[] | undefined,
  candidateLocations: HiringLocation[] | undefined,
  roleRadiusMiles = 0,
  candidateRadiusMiles = 0,
): CompatibilityState {
  if (!roleLocations?.length || !candidateLocations?.length) return "unknown";
  for (const roleLocation of roleLocations) {
    for (const candidateLocation of candidateLocations) {
      const leftKey = locationKey(roleLocation);
      const rightKey = locationKey(candidateLocation);
      if (leftKey && rightKey && leftKey === rightKey) return "compatible";
      const leftCoordinates = coordinates(roleLocation);
      const rightCoordinates = coordinates(candidateLocation);
      if (
        leftCoordinates &&
        rightCoordinates &&
        milesBetween(leftCoordinates, rightCoordinates) <=
          Math.max(0, roleRadiusMiles) + Math.max(0, candidateRadiusMiles)
      ) {
        return "compatible";
      }
    }
  }
  return "incompatible";
}

function compensationState(
  maximum: number | undefined,
  minimum: number | undefined,
  roleCurrency: string | undefined,
  candidateCurrency: string | undefined,
): CompatibilityState {
  if (maximum == null || minimum == null) return "unknown";
  if (roleCurrency && candidateCurrency && roleCurrency !== candidateCurrency) {
    return "incompatible";
  }
  if (Boolean(roleCurrency) !== Boolean(candidateCurrency)) return "unknown";
  return minimum <= maximum ? "compatible" : "incompatible";
}

function interestState(value: HiringInterest | undefined): CompatibilityState {
  if (!value) return "unknown";
  return value === "not_interested" ? "incompatible" : "compatible";
}

function roleState(
  interest: HiringInterest | undefined,
  roleFocus: CompatibilityState,
): CompatibilityState {
  const explicit = interestState(interest);
  if (explicit === "incompatible" || roleFocus === "incompatible") {
    return "incompatible";
  }
  if (explicit === "compatible" || roleFocus === "compatible") {
    return "compatible";
  }
  return "unknown";
}

function exactExpectations(
  candidate: CandidateConstraints,
): Record<string, unknown> | undefined {
  if (candidate.sharingMode !== "exact_expectations") return undefined;
  return {
    ...(candidate.companyInterest
      ? { companyInterest: candidate.companyInterest }
      : {}),
    ...(candidate.roleInterest ? { roleInterest: candidate.roleInterest } : {}),
    ...(candidate.compensationMinimum == null
      ? {}
      : { compensationMinimum: candidate.compensationMinimum }),
    ...(candidate.compensationCurrency
      ? { compensationCurrency: candidate.compensationCurrency }
      : {}),
    ...(candidate.equityMinimumPercent == null
      ? {}
      : { equityMinimumPercent: candidate.equityMinimumPercent }),
    ...(candidate.locations?.length ? { locations: candidate.locations } : {}),
    ...(candidate.locationRadiusMiles == null
      ? {}
      : { locationRadiusMiles: candidate.locationRadiusMiles }),
    ...(candidate.workModes?.length ? { workModes: candidate.workModes } : {}),
    ...(candidate.employmentTypes?.length
      ? { employmentTypes: candidate.employmentTypes }
      : {}),
    ...(candidate.sponsorshipRequired == null
      ? {}
      : { sponsorshipRequired: candidate.sponsorshipRequired }),
    ...(candidate.earliestStart
      ? { earliestStart: candidate.earliestStart }
      : {}),
    ...(candidate.levels?.length ? { levels: candidate.levels } : {}),
    ...(candidate.roleFocus?.length ? { roleFocus: candidate.roleFocus } : {}),
    ...(candidate.priorityDimensions?.length
      ? { priorityDimensions: candidate.priorityDimensions }
      : {}),
    ...(candidate.approvedNote ? { note: candidate.approvedNote } : {}),
  };
}

export function matchHiringConstraints(
  role: RoleConstraints,
  candidate: CandidateConstraints,
): HiringMatchResult {
  const compensation = compensationState(
    role.compensationMaximum,
    candidate.compensationMinimum,
    role.compensationCurrency,
    candidate.compensationCurrency,
  );
  const equity: CompatibilityState =
    role.equityMaximumPercent == null || candidate.equityMinimumPercent == null
      ? "unknown"
      : candidate.equityMinimumPercent <= role.equityMaximumPercent
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
  const dimensions: Record<HiringDimension, CompatibilityState> = {
    company: interestState(candidate.companyInterest),
    role: roleState(
      candidate.roleInterest,
      overlap(role.roleFocus, candidate.roleFocus),
    ),
    compensation,
    equity,
    location: locationOverlap(
      role.locations,
      candidate.locations,
      role.locationRadiusMiles,
      candidate.locationRadiusMiles,
    ),
    workMode: overlap(role.workModes, candidate.workModes),
    employmentType: overlap(
      role.employmentTypes,
      candidate.employmentTypes,
    ),
    sponsorship,
    timing,
    level: overlap(role.levels, candidate.levels),
  };
  // The first hiring contract shipped before company/role/equity signals.
  // Ignore a new dimension only when neither side supplied anything for it,
  // so existing saved profiles keep their prior verdict until they opt in.
  const values = HIRING_DIMENSIONS.filter((dimension) => {
    if (dimension === "company") return candidate.companyInterest != null;
    if (dimension === "role") {
      return Boolean(
        candidate.roleInterest || candidate.roleFocus?.length || role.roleFocus?.length,
      );
    }
    if (dimension === "equity") {
      return (
        candidate.equityMinimumPercent != null || role.equityMaximumPercent != null
      );
    }
    if (dimension === "employmentType") {
      return Boolean(
        role.employmentTypes?.length || candidate.employmentTypes?.length,
      );
    }
    return true;
  }).map((dimension) => dimensions[dimension]);
  const verdict = values.includes("incompatible")
    ? "incompatible"
    : values.includes("unknown")
      ? "human_review"
      : "compatible";
  const gaps = HIRING_DIMENSIONS.filter(
    (dimension) => dimensions[dimension] === "incompatible",
  ).map((dimension) => ({ dimension, ...GAP_COPY[dimension] }));
  const recruiterMayRevise = candidate.recruiterMayRevise !== false;
  const candidateSignal = candidate.conversationSignal ?? "unspecified";
  const candidateClosed =
    candidateSignal === "not_interested" ||
    candidate.companyInterest === "not_interested";
  const alignment = candidateClosed
    ? "not_aligned"
    : verdict === "compatible" && candidateSignal === "ready_if_aligned"
      ? "ready_for_intro"
      : verdict === "compatible"
        ? "aligned"
        : verdict === "incompatible" &&
            recruiterMayRevise &&
            gaps.some((gap) => gap.recruiterCanAdjust)
          ? "revisable"
          : verdict === "incompatible"
            ? "not_aligned"
            : "needs_information";
  const nextStep =
    alignment === "ready_for_intro"
      ? "Ask both people for the final yes before making an introduction."
      : alignment === "aligned"
        ? "Share the aligned terms and ask whether the candidate wants an introduction."
        : alignment === "revisable"
          ? "Revise the adjustable role terms, then run the alignment check again."
          : alignment === "not_aligned"
            ? "Do not push for a call. Close the outreach unless the candidate reopens it."
            : "Fill the unknown dimensions before asking the candidate to engage.";
  const shareableExpectations = exactExpectations(candidate);

  return {
    verdict,
    alignment,
    dimensions,
    gaps,
    candidateSignal,
    recruiterMayRevise,
    nextStep,
    note:
      alignment === "ready_for_intro"
        ? "The submitted terms align and the candidate approved a conversation if they remain true."
        : verdict === "compatible"
        ? "The submitted hard constraints overlap."
        : verdict === "incompatible"
          ? recruiterMayRevise
            ? "At least one expectation is not met, and the candidate is open to a revised role."
            : "At least one hard constraint does not overlap."
          : "No hard mismatch was found, but a person should review missing information.",
    ...(shareableExpectations ? { shareableExpectations } : {}),
  };
}
