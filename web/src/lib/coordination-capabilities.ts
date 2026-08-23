import type { ActorContext } from "@/lib/actor";
import { AgentApiError } from "@/lib/agent-errors";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";
import { searchDiscovery } from "@/lib/discovery-service";
import { runScheduleMeeting } from "@/lib/schedule-meeting";

export type CoordinationCapabilityName =
  | "schedule_meeting"
  | "discovery_search";

export type CoordinationCapabilityExecutionContext = {
  actor: ActorContext;
  jobId?: string | null;
};

export type CoordinationCapabilityDefinition = {
  name: CoordinationCapabilityName;
  version: number;
  description: string;
  requiredExternalScopes: readonly string[];
  humanApproval: "always" | "policy" | "never";
  parseInput(payload: Record<string, unknown>): Record<string, unknown>;
  redactInput(input: Record<string, unknown>): Record<string, unknown>;
  execute(
    context: CoordinationCapabilityExecutionContext,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
};

export class CoordinationCapabilityError extends AgentApiError {
  retryable: boolean;

  constructor(
    message: string,
    retryable = false,
    status = retryable ? 503 : 400,
    details?: Record<string, unknown>,
  ) {
    super(status, message, details);
    this.retryable = retryable;
  }
}

function optionalString(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new CoordinationCapabilityError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new CoordinationCapabilityError(
      `${field} must be between 1 and ${maxLength} characters`,
    );
  }
  return trimmed;
}

function scheduleInput(payload: Record<string, unknown>) {
  const peerEmail = optionalString(payload.peerEmail, "peerEmail", 320);
  const linkId = optionalString(payload.linkId, "linkId", 100);
  const peerEmails = Array.isArray(payload.peerEmails)
    ? payload.peerEmails
        .map((value, index) =>
          optionalString(value, `peerEmails[${index}]`, 320),
        )
        .filter((value): value is string => Boolean(value))
    : undefined;
  if (!peerEmail && !peerEmails?.length && !linkId) {
    throw new CoordinationCapabilityError(
      "peerEmail, peerEmails, or linkId is required",
    );
  }

  const durationMinutes =
    payload.durationMinutes === undefined
      ? undefined
      : Number(payload.durationMinutes);
  if (
    durationMinutes !== undefined &&
    (!Number.isInteger(durationMinutes) ||
      durationMinutes < 5 ||
      durationMinutes > 480)
  ) {
    throw new CoordinationCapabilityError(
      "durationMinutes must be a whole number between 5 and 480",
    );
  }

  return {
    peerEmail,
    peerEmails,
    linkId,
    durationMinutes,
    windowStart: optionalString(payload.windowStart, "windowStart", 80),
    windowEnd: optionalString(payload.windowEnd, "windowEnd", 80),
    timezone: optionalString(payload.timezone, "timezone", 100),
    title: optionalString(payload.title, "title", 120),
    notes: optionalString(payload.notes, "notes", 2_000),
    origin: optionalString(payload.origin, "origin", 500),
    idempotencyKey: optionalString(
      payload.idempotencyKey,
      "idempotencyKey",
      160,
    ),
  };
}

const scheduleMeeting: CoordinationCapabilityDefinition = {
  name: "schedule_meeting",
  version: 1,
  description:
    "Compare linked calendars, propose free times, and stop for human confirmation before booking.",
  requiredExternalScopes: ["tasks:write"],
  humanApproval: "always",
  parseInput: scheduleInput,
  redactInput(input) {
    return {
      peerCount:
        (input.peerEmail ? 1 : 0) +
        (Array.isArray(input.peerEmails) ? input.peerEmails.length : 0),
      usesLink: Boolean(input.linkId),
      durationMinutes: input.durationMinutes ?? 30,
      hasWindow: Boolean(input.windowStart && input.windowEnd),
      hasTitle: Boolean(input.title),
      hasNotes: Boolean(input.notes),
    };
  },
  async execute(context, input) {
    if (!(["user", "agent", "hosted_agent"] as const).includes(
      context.actor.kind as "user" | "agent" | "hosted_agent",
    )) {
      throw new CoordinationCapabilityError(
        `Actor ${context.actor.mode} cannot schedule meetings`,
      );
    }
    try {
      return (await runScheduleMeeting(
        context.actor.user,
        {
          ...(input as Parameters<typeof runScheduleMeeting>[1]),
          idempotencyKey:
            typeof input.idempotencyKey === "string"
              ? input.idempotencyKey
              : context.jobId
                ? `sage:${context.jobId}`
                : undefined,
        },
        {
          kind: context.actor.kind as "user" | "agent" | "hosted_agent",
          apiKeyId: context.actor.apiKeyId ?? null,
        },
      )) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof AgentApiError) {
        throw new CoordinationCapabilityError(
          error.message,
          error.status >= 500,
          error.status,
          error.details,
        );
      }
      throw error;
    }
  },
};

const discoverySearch: CoordinationCapabilityDefinition = {
  name: "discovery_search",
  version: 1,
  description:
    "Search an active, human-approved purpose without revealing identities or private claims.",
  requiredExternalScopes: ["discovery:read"],
  humanApproval: "never",
  parseInput(payload) {
    const intentSlug = optionalString(payload.intentSlug, "intentSlug", 100);
    if (!intentSlug) {
      throw new CoordinationCapabilityError("intentSlug is required");
    }
    const limit = payload.limit === undefined ? undefined : Number(payload.limit);
    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || limit < 1 || limit > 20)
    ) {
      throw new CoordinationCapabilityError(
        "limit must be a whole number between 1 and 20",
      );
    }
    return { intentSlug, limit };
  },
  redactInput(input) {
    return {
      intentSlug: input.intentSlug,
      requestedLimit: input.limit ?? null,
    };
  },
  async execute(context, input) {
    if (!discoveryFeatureEnabled()) {
      throw new CoordinationCapabilityError(
        "Discovery is temporarily unavailable",
        true,
        503,
      );
    }
    try {
      return (await searchDiscovery({
        actor: {
          user: context.actor.user,
          kind:
            context.actor.mode === "hosted_agent"
              ? "hosted_agent"
              : context.actor.mode === "external_agent"
                ? "agent"
                : "user",
          apiKeyId: context.actor.apiKeyId ?? null,
        },
        intentSlug: String(input.intentSlug),
        limit: typeof input.limit === "number" ? input.limit : undefined,
      })) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof AgentApiError) {
        throw new CoordinationCapabilityError(
          error.message,
          error.status >= 500,
          error.status,
          error.details,
        );
      }
      throw error;
    }
  },
};

const registry: Record<
  CoordinationCapabilityName,
  CoordinationCapabilityDefinition
> = {
  schedule_meeting: scheduleMeeting,
  discovery_search: discoverySearch,
};

export function listCoordinationCapabilities() {
  return Object.values(registry).map((capability) => ({
    name: capability.name,
    version: capability.version,
    description: capability.description,
    requiredExternalScopes: capability.requiredExternalScopes,
    humanApproval: capability.humanApproval,
  }));
}

export function getCoordinationCapability(
  name: string,
): CoordinationCapabilityDefinition {
  const capability = registry[name as CoordinationCapabilityName];
  if (!capability) {
    throw new CoordinationCapabilityError(
      `Unsupported coordination capability: ${name}`,
    );
  }
  return capability;
}

export async function executeCoordinationCapability(
  name: string,
  context: CoordinationCapabilityExecutionContext,
  payload: Record<string, unknown>,
) {
  const capability = getCoordinationCapability(name);
  if (context.actor.mode === "external_agent") {
    const scopes = new Set(context.actor.scopes ?? []);
    const missing = capability.requiredExternalScopes.find(
      (scope) => !scopes.has("*") && !scopes.has(scope),
    );
    if (missing) {
      throw new CoordinationCapabilityError(
        `Agent connection requires scope: ${missing}`,
        false,
        403,
        { code: "insufficient_scope", requiredScope: missing },
      );
    }
  }
  return capability.execute(context, capability.parseInput(payload));
}
