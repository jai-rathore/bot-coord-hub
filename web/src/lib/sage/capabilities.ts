import type { ActorContext } from "@/lib/actor";
import { AgentApiError } from "@/lib/agent-errors";
import {
  CoordinationCapabilityError,
  getCoordinationCapability,
  listCoordinationCapabilities,
} from "@/lib/coordination-capabilities";
import { requestDiscoveryIntroduction } from "@/lib/discovery-service";
import {
  prepareSageDiscoveryEnrollment,
  runSageDiscoveryIntake,
  type SageDiscoveryTelemetry,
} from "@/lib/sage/discovery-conversation";

export type SageCapabilityName =
  | "schedule_meeting"
  | "discovery_search"
  | "discovery_intake"
  | "discovery_prepare_enrollment"
  | "discovery_stage_introduction";

export type SageCapabilityOutcome = {
  state: "waiting_human" | "completed";
  result: Record<string, unknown>;
  telemetry?: SageDiscoveryTelemetry;
};

export type SageCapabilityExecutionContext = {
  actor: ActorContext;
  jobId: string;
};

export type SageCapabilityDefinition = {
  name: SageCapabilityName;
  version: number;
  description: string;
  humanApproval: "always" | "policy" | "never";
  parseInput(payload: Record<string, unknown>): Record<string, unknown>;
  redactInput(input: Record<string, unknown>): Record<string, unknown>;
  execute(
    context: SageCapabilityExecutionContext,
    input: Record<string, unknown>,
  ): Promise<SageCapabilityOutcome>;
};

export class SageCapabilityError extends Error {
  retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(
  payload: Record<string, unknown>,
  field: string,
  maximum = 200,
) {
  const value = payload[field];
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new SageCapabilityError(`${field} is required`);
  }
  return value.trim();
}

const sharedSchedule = getCoordinationCapability("schedule_meeting");
const sharedDiscoverySearch = getCoordinationCapability("discovery_search");

const scheduleMeeting: SageCapabilityDefinition = {
  name: "schedule_meeting",
  version: sharedSchedule.version,
  description: sharedSchedule.description,
  humanApproval: sharedSchedule.humanApproval,
  parseInput: sharedSchedule.parseInput,
  redactInput: sharedSchedule.redactInput,
  async execute(context, input) {
    let raw: Record<string, unknown>;
    try {
      raw = await sharedSchedule.execute(context, input);
    } catch (error) {
      if (error instanceof CoordinationCapabilityError) {
        throw new SageCapabilityError(error.message, error.retryable);
      }
      throw error;
    }

    const session = record(raw.session);
    const calendar = record(raw.calendar);
    const sessionId =
      (typeof raw.sessionId === "string" && raw.sessionId) ||
      (typeof session?.id === "string" && session.id) ||
      null;
    if (!sessionId) {
      throw new SageCapabilityError(
        "Scheduling finished without a durable session identifier",
        true,
      );
    }

    const calendarStatus =
      typeof calendar?.status === "string" ? calendar.status : "pending";
    const sessionStatus =
      typeof session?.status === "string" ? session.status : "open";
    const booked = calendarStatus === "booked" || sessionStatus === "confirmed";

    return {
      state: booked ? "completed" : "waiting_human",
      result: {
        ok: true,
        sessionId,
        sessionStatus,
        calendarStatus,
        waitingForHuman: !booked,
        waitingForCalendars: raw.waiting_for_calendars === true,
        missingCalendarCount: Array.isArray(raw.missingCalendars)
          ? raw.missingCalendars.length
          : 0,
        message:
          typeof raw.message === "string"
            ? raw.message.slice(0, 500)
            : booked
              ? "The meeting is booked."
              : "Sage created the scheduling task and is waiting for people.",
      },
    };
  },
};

const discoverySearch: SageCapabilityDefinition = {
  name: "discovery_search",
  version: sharedDiscoverySearch.version,
  description: sharedDiscoverySearch.description,
  humanApproval: sharedDiscoverySearch.humanApproval,
  parseInput: sharedDiscoverySearch.parseInput,
  redactInput: sharedDiscoverySearch.redactInput,
  async execute(context, input) {
    let raw: Record<string, unknown>;
    try {
      raw = await sharedDiscoverySearch.execute(context, input);
    } catch (error) {
      if (error instanceof CoordinationCapabilityError) {
        throw new SageCapabilityError(error.message, error.retryable);
      }
      throw error;
    }
    const candidates = Array.isArray(raw.candidates)
      ? raw.candidates
          .filter(
            (candidate): candidate is Record<string, unknown> =>
              Boolean(candidate) &&
              typeof candidate === "object" &&
              !Array.isArray(candidate),
          )
          .slice(0, 20)
          .map((candidate) => ({
            candidateHandle: candidate.candidateHandle,
            compatibility: candidate.compatibility,
            untrustedParticipantData: candidate.untrustedParticipantData,
            contentPolicy: candidate.contentPolicy,
            expiresAt: candidate.expiresAt,
          }))
      : [];
    return {
      state: "completed",
      result: {
        ok: true,
        intentSlug: input.intentSlug,
        candidateCount: candidates.length,
        candidates,
        message: candidates.length
          ? "Sage found anonymous possibilities. You decide whether to request any introduction."
          : "Sage did not find a new compatible possibility in this scan.",
      },
    };
  },
};

const discoveryIntake: SageCapabilityDefinition = {
  name: "discovery_intake",
  version: 1,
  description:
    "Turn one authenticated human message into a typed discovery draft update without activating discovery.",
  humanApproval: "never",
  parseInput(payload) {
    return {
      threadId: requiredString(payload, "threadId", 100),
      messageId: requiredString(payload, "messageId", 100),
      intentSlug: requiredString(payload, "intentSlug", 100),
    };
  },
  redactInput(input) {
    return {
      threadId: input.threadId,
      messageId: input.messageId,
      intentSlug: input.intentSlug,
    };
  },
  async execute(context, input) {
    try {
      const outcome = await runSageDiscoveryIntake({
        user: context.actor.user,
        threadId: String(input.threadId),
        messageId: String(input.messageId),
      });
      return {
        state: "completed",
        result: outcome.result,
        telemetry: outcome.telemetry,
      };
    } catch (error) {
      if (error instanceof AgentApiError) {
        throw new SageCapabilityError(error.message, error.status >= 500);
      }
      throw error;
    }
  },
};

const discoveryPrepareEnrollment: SageCapabilityDefinition = {
  name: "discovery_prepare_enrollment",
  version: 1,
  description:
    "Prepare a Sage discovery draft for the human's exact snapshot review without activating it.",
  humanApproval: "always",
  parseInput(payload) {
    return { threadId: requiredString(payload, "threadId", 100) };
  },
  redactInput(input) {
    return { threadId: input.threadId };
  },
  async execute(context, input) {
    try {
      return {
        state: "waiting_human",
        result: await prepareSageDiscoveryEnrollment({
          user: context.actor.user,
          threadId: String(input.threadId),
        }),
      };
    } catch (error) {
      if (error instanceof AgentApiError) {
        throw new SageCapabilityError(error.message, error.status >= 500);
      }
      throw error;
    }
  },
};

const discoveryStageIntroduction: SageCapabilityDefinition = {
  name: "discovery_stage_introduction",
  version: 1,
  description:
    "Save an anonymous introduction draft and wait for the requesting human before notifying anyone.",
  humanApproval: "always",
  parseInput(payload) {
    return {
      candidateHandle: requiredString(payload, "candidateHandle", 1_000),
    };
  },
  redactInput() {
    return { hasCandidateHandle: true };
  },
  async execute(context, input) {
    try {
      const result = await requestDiscoveryIntroduction({
        actor: { user: context.actor.user, kind: "hosted_agent" },
        candidateHandle: String(input.candidateHandle),
        idempotencyKey: `sage:${context.jobId}`,
      });
      return {
        state: "waiting_human",
        result: {
          ok: true,
          status: result.status,
          requesterConfirmed: false,
          waitingForHuman: true,
          message:
            "Sage prepared the anonymous introduction request. Approve it yourself before the other person is notified.",
        },
      };
    } catch (error) {
      if (error instanceof AgentApiError) {
        throw new SageCapabilityError(error.message, error.status >= 500);
      }
      throw error;
    }
  },
};

const registry: Record<SageCapabilityName, SageCapabilityDefinition> = {
  schedule_meeting: scheduleMeeting,
  discovery_search: discoverySearch,
  discovery_intake: discoveryIntake,
  discovery_prepare_enrollment: discoveryPrepareEnrollment,
  discovery_stage_introduction: discoveryStageIntroduction,
};

export function listSageCapabilities() {
  const shared = new Map<string, { humanApproval: "always" | "policy" | "never" }>(
    listCoordinationCapabilities().map((capability) => [
      capability.name,
      capability,
    ]),
  );
  return Object.values(registry).map((capability) => ({
    name: capability.name,
    version: capability.version,
    description: capability.description,
    humanApproval:
      shared.get(capability.name)?.humanApproval ?? capability.humanApproval,
  }));
}

export function getSageCapability(name: string): SageCapabilityDefinition {
  const capability = registry[name as SageCapabilityName];
  if (!capability) {
    throw new SageCapabilityError(`Unsupported Sage capability: ${name}`);
  }
  return capability;
}
