import {
  validateIntentDefinition,
  type IntentDefinition,
} from "@/lib/intent-contract";
import { canonicalLocationsEnabled } from "@/lib/discovery-feature";

const humanApprovedSource = "human_or_agent_with_approval" as const;
const canonicalLocationContracts = canonicalLocationsEnabled();

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
  version: canonicalLocationContracts ? 4 : 3,
  agentPrompt:
    "First ask whether the human is looking for work or hiring. HoneyMatcha privately compares recruiting expectations without revealing raw constraints. Pair annual compensation with an approved ISO currency, represent place as canonical city plus vicinity radius, and keep remote as a separate work mode. If the recruiter has a job URL or description, call draft_hiring_role and wait for approval before using suggestedPrivateConfig. For a specific candidate, use a targeted hiring_compatibility guest request so approved fit gaps can be revised before an introduction.",
  enrollment: {
    summary:
      "Choose whether you are looking for a job or hiring, then privately compare only the relevant constraints.",
    fields: [
      {
        key: "participantType",
        prompt: "Are you looking for a job or hiring someone?",
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
        prompt: "Which cities should anchor the acceptable work area?",
        ...(canonicalLocationContracts
          ? {
              description:
                "Choose canonical cities, then set a vicinity in miles. Search text is sent to Geoapify without your HoneyMatcha identity. Remote work is represented separately.",
              type: "location_list",
              locationGranularity: "city",
            }
          : { type: "string_list" }),
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 180,
      },
      {
        key: "locationRadiusMiles",
        prompt: "How far from each selected city is acceptable?",
        type: "number",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 180,
      },
      {
        key: "workModes",
        prompt: "Which work mode is acceptable?",
        type: "string_list",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 180,
      },
      {
        key: "employmentTypes",
        prompt: "Which employment type is relevant?",
        type: "string_list",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 180,
      },
      {
        key: "compensationCurrency",
        prompt: "Which currency applies to annual base compensation?",
        type: "enum",
        options: ["USD", "EUR", "GBP", "CAD", "AUD", "INR", "SGD", "CHF"],
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 90,
      },
      {
        key: "compensationMinimum",
        prompt: "Candidate: what is the minimum annual base compensation?",
        type: "number",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 90,
      },
      {
        key: "compensationMaximum",
        prompt: "Employer: what is the maximum annual base compensation?",
        type: "number",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 90,
      },
      {
        key: "equityMinimumPercent",
        prompt: "Candidate: what is the minimum acceptable equity percentage?",
        type: "number",
        required: false,
        sensitivity: "private",
        sourcePolicy: humanApprovedSource,
        retentionDays: 90,
      },
      {
        key: "equityMaximumPercent",
        prompt: "Employer: what is the maximum equity percentage for the role?",
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
        key: "roleFocus",
        prompt: "Which areas of responsibility or role scope are relevant?",
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
    projectionFields: ["participantType"],
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
  version: canonicalLocationContracts ? 2 : 1,
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
        sensitivity: "private",
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
    projectionFields: ["participantType"],
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

export const DATING_INTRODUCTION_DEFINITION = validateIntentDefinition({
  version: canonicalLocationContracts ? 2 : 1,
  agentPrompt:
    "HoneyMatcha can privately look for adult dating introductions. Ask whether your human wants this. Age and relationship intent must come from the human. Search other enrolled people, then recommend a candidate only as a suggestion. Never enroll, request an introduction, or claim two people should date without the human's approval. Identities stay hidden until both humans accept.",
  enrollment: {
    summary:
      "Adult-only dating introductions. Agents search privately and suggest; both humans confirm before anyone is identified.",
    fields: [
      {
        key: "age",
        prompt: "Confirm that you are 18 or older by entering your age.",
        type: "number",
        required: true,
        sensitivity: "private",
        sourcePolicy: "human_only",
        retentionDays: 90,
      },
      {
        key: "relationshipIntent",
        prompt: "What kind of relationship are you most open to?",
        type: "enum",
        options: ["long_term", "casual", "friendship", "figuring_out"],
        required: true,
        sensitivity: "discoverable",
        sourcePolicy: "human_only",
        retentionDays: 90,
      },
      {
        key: "headline",
        prompt:
          "What short, non-identifying headline may be shared after both people accept?",
        type: "text",
        required: true,
        sensitivity: "disclose_after_match",
        sourcePolicy: humanApprovedSource,
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
        prompt:
          "What may be shared only after both people accept an introduction?",
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
      "headline",
      "interests",
      "introductionSummary",
    ],
  },
  discovery: {
    enabled: true,
    handler: "dating_v1",
    locationGranularity: "city",
    pageLimit: 5,
    handleTtlMinutes: 15,
    projectionFields: ["relationshipIntent"],
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

export const CANONICAL_INTENT_DEFINITIONS: Record<
  string,
  IntentDefinition
> = {
  schedule_meeting: SCHEDULE_MEETING_DEFINITION,
  hiring_compatibility: HIRING_DISCOVERY_DEFINITION,
  local_meetup: LOCAL_MEETUP_DEFINITION,
  dating_introduction: DATING_INTRODUCTION_DEFINITION,
};

export function canonicalIntentDefinition(
  slug: string,
): IntentDefinition | null {
  return CANONICAL_INTENT_DEFINITIONS[slug] ?? null;
}
