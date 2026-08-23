import type { ActorContext } from "@/lib/actor";
import {
  CoordinationCapabilityError,
  getCoordinationCapability,
  listCoordinationCapabilities,
} from "@/lib/coordination-capabilities";

export type SageCapabilityName = "schedule_meeting" | "discovery_search";

export type SageCapabilityOutcome = {
  state: "waiting_human" | "completed";
  result: Record<string, unknown>;
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

const registry: Record<SageCapabilityName, SageCapabilityDefinition> = {
  schedule_meeting: scheduleMeeting,
  discovery_search: discoverySearch,
};

export function listSageCapabilities() {
  const shared = new Map(
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
