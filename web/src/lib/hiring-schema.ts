import {
  HIRING_CURRENCY_CODES,
  HIRING_EMPLOYMENT_TYPES,
  HIRING_LEVELS,
  HIRING_ROLE_FAMILIES,
  HIRING_WORK_MODES,
} from "@/lib/hiring-options";
import { HIRING_DIMENSIONS } from "@/lib/hiring-match";

const HIRING_INTERESTS = ["interested", "open", "not_interested"] as const;

export const HIRING_PRIVATE_CONFIG_DESCRIPTION =
  "Recruiter-approved role terms. Use controlled enums from HoneyMatcha, never free-text substitutes. Resolve each work city with resolve_discovery_location and send the returned resolutionToken in locations. Remote work belongs in workModes, not as a city. Compensation amounts must include compensationCurrency; never convert currencies.";

export const HIRING_PRIVATE_CONFIG_SCHEMA = {
  type: "object",
  description: HIRING_PRIVATE_CONFIG_DESCRIPTION,
  properties: {
    companyName: { type: "string", description: "The hiring company." },
    roleTitle: { type: "string", description: "The real role title." },
    compensationMaximum: {
      type: "number",
      description: "Maximum annual base compensation. Never annualize hourly pay.",
    },
    compensationCurrency: {
      type: "string",
      enum: [...HIRING_CURRENCY_CODES],
    },
    equityMaximumPercent: {
      type: "number",
      description: "Maximum equity percentage. Use 0 when the role has no equity.",
    },
    locations: {
      type: "array",
      description:
        "Canonical city tokens from resolve_discovery_location. Do not invent place IDs or send a country/region as a city.",
      items: { type: "string" },
    },
    locationRadiusMiles: {
      type: "number",
      minimum: 0,
      maximum: 500,
      description: "Acceptable vicinity around each selected city.",
    },
    workModes: {
      type: "array",
      items: { type: "string", enum: [...HIRING_WORK_MODES] },
    },
    employmentTypes: {
      type: "array",
      items: { type: "string", enum: [...HIRING_EMPLOYMENT_TYPES] },
    },
    sponsorshipAvailable: { type: "boolean" },
    latestStart: {
      type: "string",
      description: "Latest acceptable start date, YYYY-MM-DD.",
    },
    levels: {
      type: "array",
      items: { type: "string", enum: [...HIRING_LEVELS] },
    },
    roleFocus: {
      type: "array",
      items: { type: "string", enum: [...HIRING_ROLE_FAMILIES] },
    },
  },
  additionalProperties: false,
} as const;

export const HIRING_CANDIDATE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    companyInterest: {
      type: "string",
      enum: [...HIRING_INTERESTS],
    },
    roleInterest: {
      type: "string",
      enum: [...HIRING_INTERESTS],
    },
    compensationMinimum: { type: "number" },
    compensationCurrency: {
      type: "string",
      enum: [...HIRING_CURRENCY_CODES],
    },
    equityMinimumPercent: { type: "number" },
    locations: { type: "array", items: { type: "string" } },
    locationRadiusMiles: { type: "number", minimum: 0, maximum: 500 },
    workModes: {
      type: "array",
      items: { type: "string", enum: [...HIRING_WORK_MODES] },
    },
    employmentTypes: {
      type: "array",
      items: { type: "string", enum: [...HIRING_EMPLOYMENT_TYPES] },
    },
    sponsorshipRequired: { type: "boolean" },
    earliestStart: { type: "string" },
    levels: {
      type: "array",
      items: { type: "string", enum: [...HIRING_LEVELS] },
    },
    roleFocus: {
      type: "array",
      items: { type: "string", enum: [...HIRING_ROLE_FAMILIES] },
    },
    priorityDimensions: {
      type: "array",
      items: { type: "string", enum: [...HIRING_DIMENSIONS] },
    },
    sharingMode: {
      type: "string",
      enum: ["gaps_only", "exact_expectations"],
    },
    recruiterMayRevise: { type: "boolean" },
    conversationSignal: {
      type: "string",
      enum: ["ready_if_aligned", "open_to_revision", "not_interested"],
    },
    approvedNote: { type: "string" },
  },
  additionalProperties: false,
} as const;

export const HIRING_DRAFT_NEXT_STEPS = [
  "Show every extracted term to your recruiter human. Never invent missing compensation, currency, equity, or location details.",
  "Resolve each locationQueries city with resolve_discovery_location and put the returned resolutionToken values in privateConfig.locations.",
  "After explicit approval, send suggestedPrivateConfig through propose_hiring_role, create_guest_task, revise_hiring_request, or submit_discovery_enrollment.",
] as const;
