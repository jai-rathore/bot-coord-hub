export const INTENT_FIELD_TYPES = [
  "text",
  "string_list",
  "location_list",
  "number",
  "boolean",
  "date",
  "enum",
] as const;

export const INTENT_FIELD_SENSITIVITIES = [
  "discoverable",
  "private",
  "disclose_after_match",
] as const;

export const INTENT_SOURCE_POLICIES = [
  "human_only",
  "human_or_agent_with_approval",
] as const;

export const LOCATION_GRANULARITIES = [
  "none",
  "country",
  "region",
  "city",
  "neighborhood",
] as const;

export const INTENT_HANDLER_IDS = [
  "none",
  "hiring_v1",
  "local_meetup_v1",
  "dating_v1",
] as const;

export type IntentFieldType = (typeof INTENT_FIELD_TYPES)[number];
export type IntentFieldSensitivity =
  (typeof INTENT_FIELD_SENSITIVITIES)[number];
export type IntentSourcePolicy = (typeof INTENT_SOURCE_POLICIES)[number];
export type LocationGranularity = (typeof LOCATION_GRANULARITIES)[number];
export type IntentHandlerId = (typeof INTENT_HANDLER_IDS)[number];

export type IntentFieldDefinition = {
  key: string;
  prompt: string;
  description?: string;
  type: IntentFieldType;
  required: boolean;
  sensitivity: IntentFieldSensitivity;
  sourcePolicy: IntentSourcePolicy;
  options?: string[];
  retentionDays: number;
};

export type IntentDefinition = {
  version: number;
  agentPrompt: string;
  enrollment: {
    summary: string;
    fields: IntentFieldDefinition[];
  };
  eligibility: {
    minimumAge?: number;
    requiredFields: string[];
  };
  discovery: {
    enabled: boolean;
    handler: IntentHandlerId;
    locationGranularity: LocationGranularity;
    pageLimit: number;
    handleTtlMinutes: number;
    projectionFields: string[];
  };
  disclosure: {
    requiresMutualInterest: true;
    requiresHumanConfirmation: true;
    fields: string[];
  };
  safety: {
    blockingRequired: true;
    reportingRequired: true;
  };
};

const asRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function positiveInteger(
  value: unknown,
  label: string,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > maximum
  ) {
    throw new Error(`${label} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function validateField(value: unknown, index: number): IntentFieldDefinition {
  const field = asRecord(value, `enrollment.fields[${index}]`);
  const type = enumValue(
    field.type,
    INTENT_FIELD_TYPES,
    `enrollment.fields[${index}].type`,
  );
  const options =
    field.options === undefined
      ? undefined
      : stringArray(field.options, `enrollment.fields[${index}].options`);
  if (type === "enum" && !options?.length) {
    throw new Error(
      `enrollment.fields[${index}].options is required for enum fields`,
    );
  }
  if (type !== "enum" && options?.length) {
    throw new Error(
      `enrollment.fields[${index}].options is supported only for enum fields`,
    );
  }
  if (field.required !== true && field.required !== false) {
    throw new Error(`enrollment.fields[${index}].required must be boolean`);
  }
  return {
    key: requiredString(field.key, `enrollment.fields[${index}].key`),
    prompt: requiredString(
      field.prompt,
      `enrollment.fields[${index}].prompt`,
    ),
    ...(field.description === undefined
      ? {}
      : {
          description: requiredString(
            field.description,
            `enrollment.fields[${index}].description`,
          ),
        }),
    type,
    required: field.required,
    sensitivity: enumValue(
      field.sensitivity,
      INTENT_FIELD_SENSITIVITIES,
      `enrollment.fields[${index}].sensitivity`,
    ),
    sourcePolicy: enumValue(
      field.sourcePolicy,
      INTENT_SOURCE_POLICIES,
      `enrollment.fields[${index}].sourcePolicy`,
    ),
    ...(options ? { options } : {}),
    retentionDays: positiveInteger(
      field.retentionDays,
      `enrollment.fields[${index}].retentionDays`,
      730,
    ),
  };
}

/**
 * Intent definitions are data, never executable code. This validator is the
 * boundary between moderated database content and the allowlisted handlers.
 */
export function validateIntentDefinition(value: unknown): IntentDefinition {
  const definition = asRecord(value, "intent definition");
  const enrollment = asRecord(definition.enrollment, "enrollment");
  const eligibility = asRecord(definition.eligibility, "eligibility");
  const discovery = asRecord(definition.discovery, "discovery");
  const disclosure = asRecord(definition.disclosure, "disclosure");
  const safety = asRecord(definition.safety, "safety");
  if (!Array.isArray(enrollment.fields)) {
    throw new Error("enrollment.fields must be an array");
  }
  const fields = enrollment.fields.map(validateField);
  const keys = fields.map((field) => field.key);
  if (new Set(keys).size !== keys.length) {
    throw new Error("enrollment field keys must be unique");
  }

  const requiredFields = stringArray(
    eligibility.requiredFields,
    "eligibility.requiredFields",
  );
  const projectionFields = stringArray(
    discovery.projectionFields,
    "discovery.projectionFields",
  );
  const disclosureFields = stringArray(
    disclosure.fields,
    "disclosure.fields",
  );
  for (const [label, values] of [
    ["eligibility.requiredFields", requiredFields],
    ["discovery.projectionFields", projectionFields],
    ["disclosure.fields", disclosureFields],
  ] as const) {
    const unknown = values.filter((key) => !keys.includes(key));
    if (unknown.length) {
      throw new Error(`${label} references unknown fields: ${unknown.join(", ")}`);
    }
  }
  for (const key of projectionFields) {
    const field = fields.find((item) => item.key === key);
    if (field?.sensitivity !== "discoverable") {
      throw new Error(
        `discovery.projectionFields may only include discoverable fields: ${key}`,
      );
    }
    if (field.type !== "enum") {
      throw new Error(
        `discovery.projectionFields may only include enum fields: ${key}`,
      );
    }
  }
  for (const key of disclosureFields) {
    const field = fields.find((item) => item.key === key);
    if (field?.sensitivity === "private") {
      throw new Error(`private field cannot be disclosed: ${key}`);
    }
  }
  if (
    disclosure.requiresMutualInterest !== true ||
    disclosure.requiresHumanConfirmation !== true
  ) {
    throw new Error(
      "disclosure must require mutual interest and human confirmation",
    );
  }
  if (safety.blockingRequired !== true || safety.reportingRequired !== true) {
    throw new Error("discovery intents must require blocking and reporting");
  }

  return {
    version: positiveInteger(definition.version, "version", 1000),
    agentPrompt: requiredString(definition.agentPrompt, "agentPrompt"),
    enrollment: {
      summary: requiredString(enrollment.summary, "enrollment.summary"),
      fields,
    },
    eligibility: {
      ...(eligibility.minimumAge === undefined
        ? {}
        : {
            minimumAge: positiveInteger(
              eligibility.minimumAge,
              "eligibility.minimumAge",
              120,
            ),
          }),
      requiredFields,
    },
    discovery: {
      enabled: discovery.enabled === true,
      handler: enumValue(
        discovery.handler,
        INTENT_HANDLER_IDS,
        "discovery.handler",
      ),
      locationGranularity: enumValue(
        discovery.locationGranularity,
        LOCATION_GRANULARITIES,
        "discovery.locationGranularity",
      ),
      pageLimit: positiveInteger(discovery.pageLimit, "discovery.pageLimit", 25),
      handleTtlMinutes: positiveInteger(
        discovery.handleTtlMinutes,
        "discovery.handleTtlMinutes",
        60,
      ),
      projectionFields,
    },
    disclosure: {
      requiresMutualInterest: true,
      requiresHumanConfirmation: true,
      fields: disclosureFields,
    },
    safety: {
      blockingRequired: true,
      reportingRequired: true,
    },
  };
}

export function missingEnrollmentFields(
  definition: IntentDefinition,
  claims: Record<string, unknown>,
): IntentFieldDefinition[] {
  return definition.enrollment.fields.filter(
    (field) =>
      field.required &&
      (claims[field.key] === undefined ||
        claims[field.key] === null ||
        claims[field.key] === ""),
  );
}

export function fieldMap(definition: IntentDefinition) {
  return new Map(definition.enrollment.fields.map((field) => [field.key, field]));
}
