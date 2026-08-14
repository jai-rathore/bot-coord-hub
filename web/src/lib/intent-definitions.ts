import {
  validateIntentDefinition,
  type IntentDefinition,
} from "@/lib/intent-contract";

const humanApprovedSource = "human_or_agent_with_approval" as const;

export const SCHEDULE_MEETING_DEFINITION = validateIntentDefinition({
  version: 1,
  agentPrompt:
    "HoneyMatcha can coordinate availability and book a meeting after the required human approvals.",
  enrollment: {
    summary: "Scheduling uses relationship and calendar permissions, not discovery.",
    fields: [
      {
        key: "timezone",
        prompt: "Which timezone should scheduling use?",
        type: "text",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 365,
      },
    ],
  },
  eligibility: { requiredFields: [] },
  discovery: {
    enabled: false,
    handler: "none",
    locationGranularity: "none",
    pageLimit: 1,
    handleTtlMinutes: 1,
    projectionFields: [],
  },
  disclosure: {
    requiresMutualInterest: true,
    requiresHumanConfirmation: true,
    fields: [],
  },
  safety: {
    blockingRequired: true,
    reportingRequired: true,
  },
});

export const HIRING_DISCOVERY_DEFINITION = validateIntentDefinition({
  version: 1,
  agentPrompt:
    "HoneyMatcha can privately look for recruiting compatibility without revealing compensation, sponsorship, or other raw constraints. Ask whether your human wants to enroll as a candidate or employer.",
  enrollment: {
    summary:
      "Privately compare role and candidate constraints before either side is identified.",
    fields: [
      {
        key: "participantType",
        prompt: "Are you participating as a candidate or employer?",
        type: "enum",
        options: ["candidate", "employer"],
        required: true,
        sensitivity: "discoverable",
        sourcePolicy: humanApprovedSource,
        retentionDays: 180,
      },
      {
        key: "headline",
        prompt:
          "What short, non-identifying headline should compatible participants see?",
        type: "text",
        required: true,
        sensitivity: "discoverable",
        sourcePolicy: humanApprovedSource,
        retentionDays: 180,
      },
      {
        key: "locations",
        prompt: "Which work locations are acceptable?",
        type: "string_list",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 180,
      },
      {
        key: "workModes",
        prompt: "Which work modes are acceptable (remote, hybrid, or onsite)?",
        type: "string_list",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 180,
      },
      {
        key: "compensationMinimum",
        prompt: "Candidate: what is the minimum acceptable compensation?",
        type: "number",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 90,
      },
      {
        key: "compensationMaximum",
        prompt: "Employer: what is the maximum compensation for the role?",
        type: "number",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 90,
      },
      {
        key: "sponsorshipRequired",
        prompt: "Candidate: is employment sponsorship required?",
        type: "boolean",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 180,
      },
      {
        key: "sponsorshipAvailable",
        prompt: "Employer: is employment sponsorship available?",
        type: "boolean",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 180,
      },
      {
        key: "earliestStart",
        prompt: "Candidate: what is the earliest start date?",
        type: "date",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 90,
      },
      {
        key: "latestStart",
        prompt: "Employer: what is the latest acceptable start date?",
        type: "date",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 90,
      },
      {
        key: "levels",
        prompt: "Which role levels are relevant?",
        type: "string_list",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 180,
      },
      {
        key: "introductionSummary",
        prompt:
          "What approved information may be shared only after mutual interest?",
        type: "text",
        required: false,
        sensitivity: "disclose_after_match",
        sourcePolicy: humanApprovedSource,
        retentionDays: 180,
      },
    ],
  },
  eligibility: {
    requiredFields: ["participantType", "headline"],
  },
  discovery: {
    enabled: true,
    handler: "hiring_v1",
    locationGranularity: "city",
    pageLimit: 10,
    handleTtlMinutes: 30,
    projectionFields: ["participantType", "headline"],
  },
  disclosure: {
    requiresMutualInterest: true,
    requiresHumanConfirmation: true,
    fields: ["headline", "introductionSummary"],
  },
  safety: {
    blockingRequired: true,
    reportingRequired: true,
  },
});

export const LOCAL_MEETUP_DEFINITION = validateIntentDefinition({
  version: 1,
  agentPrompt:
    "HoneyMatcha can privately discover hosted meetups by interest and coarse location. Ask your human whether they want to host or attend; exact venues remain hidden until approval.",
  enrollment: {
    summary:
      "Discover small hosted meetups using interests and coarse location while keeping identities and venues private.",
    fields: [
      {
        key: "participantType",
        prompt: "Do you want to host meetups, attend them, or both?",
        type: "enum",
        options: ["host", "attendee", "both"],
        required: true,
        sensitivity: "discoverable",
        sourcePolicy: humanApprovedSource,
        retentionDays: 180,
      },
      {
        key: "interests",
        prompt: "Which topics or activities are you interested in?",
        type: "string_list",
        required: true,
        sensitivity: "discoverable",
        sourcePolicy: humanApprovedSource,
        retentionDays: 180,
      },
      {
        key: "timeWindows",
        prompt: "What broad time windows usually work?",
        type: "string_list",
        required: true,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 90,
      },
      {
        key: "accessibilityNeeds",
        prompt: "Are there accessibility requirements a host should satisfy?",
        type: "string_list",
        required: false,
        sensitivity: "private",
        sourcePolicy: "human_only",
        retentionDays: 90,
      },
      {
        key: "capacity",
        prompt: "Hosts: what is the maximum group size?",
        type: "number",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 90,
      },
      {
        key: "introductionSummary",
        prompt:
          "What short description may be shared after mutual or host approval?",
        type: "text",
        required: false,
        sensitivity: "disclose_after_match",
        sourcePolicy: humanApprovedSource,
        retentionDays: 180,
      },
    ],
  },
  eligibility: {
    requiredFields: ["participantType", "interests", "timeWindows"],
  },
  discovery: {
    enabled: true,
    handler: "local_meetup_v1",
    locationGranularity: "neighborhood",
    pageLimit: 10,
    handleTtlMinutes: 30,
    projectionFields: ["participantType", "interests"],
  },
  disclosure: {
    requiresMutualInterest: true,
    requiresHumanConfirmation: true,
    fields: ["interests", "introductionSummary"],
  },
  safety: {
    blockingRequired: true,
    reportingRequired: true,
  },
});

/** Contract-only proof. It is never seeded as a live/discoverable intent. */
export const DATING_INTRODUCTION_DEFINITION = validateIntentDefinition({
  version: 1,
  agentPrompt:
    "Dating introductions are not currently live. If enabled in the future, HoneyMatcha will require adult eligibility, purpose-specific consent, private matching, mutual interest, and staged disclosure.",
  enrollment: {
    summary:
      "Contract fixture for a future adult-only, mutual-consent introduction flow.",
    fields: [
      {
        key: "age",
        prompt: "Confirm your age.",
        type: "number",
        required: true,
        sensitivity: "private",
        sourcePolicy: "human_only",
        retentionDays: 30,
      },
      {
        key: "relationshipIntent",
        prompt: "What kind of relationship are you open to?",
        type: "string_list",
        required: true,
        sensitivity: "private",
        sourcePolicy: "human_only",
        retentionDays: 90,
      },
      {
        key: "interests",
        prompt: "Which interests may be used for private matching?",
        type: "string_list",
        required: true,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 90,
      },
      {
        key: "introductionSummary",
        prompt: "What may be shared after mutual interest?",
        type: "text",
        required: true,
        sensitivity: "disclose_after_match",
        sourcePolicy: "human_only",
        retentionDays: 90,
      },
    ],
  },
  eligibility: {
    minimumAge: 18,
    requiredFields: [
      "age",
      "relationshipIntent",
      "interests",
      "introductionSummary",
    ],
  },
  discovery: {
    enabled: false,
    handler: "dating_v1",
    locationGranularity: "city",
    pageLimit: 5,
    handleTtlMinutes: 15,
    projectionFields: [],
  },
  disclosure: {
    requiresMutualInterest: true,
    requiresHumanConfirmation: true,
    fields: ["introductionSummary"],
  },
  safety: {
    blockingRequired: true,
    reportingRequired: true,
  },
});

export const CANONICAL_INTENT_DEFINITIONS: Record<
  string,
  IntentDefinition
> = {
  schedule_meeting: SCHEDULE_MEETING_DEFINITION,
  hiring_compatibility: HIRING_DISCOVERY_DEFINITION,
  local_meetup: LOCAL_MEETUP_DEFINITION,
};

export function canonicalIntentDefinition(
  slug: string,
): IntentDefinition | null {
  return CANONICAL_INTENT_DEFINITIONS[slug] ?? null;
}
