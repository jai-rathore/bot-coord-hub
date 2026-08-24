import type { ActorContext } from "@/lib/actor";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { eventParticipants } from "@/db/schema";
import { AgentApiError } from "@/lib/agent-errors";
import {
  CoordinationCapabilityError,
  getCoordinationCapability,
  listCoordinationCapabilities,
} from "@/lib/coordination-capabilities";
import {
  markDiscoveryRecommendationSources,
  materializeDiscoveryRecommendation,
  requestDiscoveryIntroduction,
} from "@/lib/discovery-service";
import { appOrigin } from "@/lib/connect-copy";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import { boardFor, eventById, participantFor } from "@/lib/events/access";
import { resolveEventRef } from "@/lib/events/agent-api";
import {
  addOption,
  assertOrganizer,
  createEvent,
  extendDeadline,
  joinEvent,
  listEventsForUser,
  publishNote,
  setNotifyUpdates,
  setResponses,
  type CreateEventInput,
  type ResponseEntry,
} from "@/lib/events/service";
import { enqueueEventNotification } from "@/lib/events/notify";
import type { EventPref } from "@/lib/events/types";
import { runEventChatTurn } from "@/lib/events/turn";
import {
  createGuestTask,
  getGuestTaskForOrganizer,
  listGuestTasksForOrganizer,
} from "@/lib/guest-tasks";
import { ackInboxItem, listInboxForUser } from "@/lib/agent-inbox";
import { createInviteLink, listLinksForUser } from "@/lib/links";
import { listPeopleMetThroughEvents } from "@/lib/people";
import {
  getSessionForUser,
  listMessagesForSession,
  listSessionsForUser,
} from "@/lib/sessions";
import {
  prepareSageDiscoveryEnrollment,
  runSageDiscoveryIntake,
  type SageDiscoveryTelemetry,
} from "@/lib/sage/discovery-conversation";
import { notifyForDiscoveryRecommendations } from "@/lib/sage/discovery-cadence";

export type SageCapabilityName =
  | "schedule_meeting"
  | "discovery_search"
  | "discovery_intake"
  | "discovery_prepare_enrollment"
  | "discovery_stage_introduction"
  | "event_chat"
  | "coordinate_event"
  | "run_guest_request"
  | "manage_connections"
  | "review_activity";

export type SageCapabilityOutcome = {
  state: "waiting_human" | "completed";
  result: Record<string, unknown>;
  telemetry?: SageDiscoveryTelemetry;
};

export type SageCapabilityExecutionContext = {
  actor: ActorContext;
  jobId: string;
  trigger:
    | "user_request"
    | "scheduled"
    | "inbox"
    | "deadline"
    | "approval_result";
};

export type SageCapabilityDefinition = {
  name: SageCapabilityName;
  version: number;
  description: string;
  humanApproval: "always" | "policy" | "never";
  parseInput(payload: Record<string, unknown>): Record<string, unknown>;
  redactInput(input: Record<string, unknown>): Record<string, unknown>;
  redactOutput(output: Record<string, unknown>): Record<string, unknown>;
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

function optionalString(
  payload: Record<string, unknown>,
  field: string,
  maximum = 200,
) {
  const value = payload[field];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new SageCapabilityError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalBoolean(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw new SageCapabilityError(`${field} must be true or false`);
  }
  return value;
}

function optionalInteger(
  payload: Record<string, unknown>,
  field: string,
  minimum: number,
  maximum: number,
) {
  const value = payload[field];
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new SageCapabilityError(
      `${field} must be a whole number between ${minimum} and ${maximum}`,
    );
  }
  return parsed;
}

function withAgentErrorBoundary(error: unknown): never {
  if (error instanceof AgentApiError) {
    throw new SageCapabilityError(error.message, error.status >= 500);
  }
  const status = Number((error as { status?: unknown })?.status);
  if (Number.isFinite(status)) {
    throw new SageCapabilityError(
      error instanceof Error ? error.message : "The operation failed",
      status >= 500,
    );
  }
  throw error;
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
  redactOutput(output) {
    return {
      ok: output.ok === true,
      sessionId: output.sessionId ?? null,
      sessionStatus: output.sessionStatus ?? null,
      calendarStatus: output.calendarStatus ?? null,
      waitingForHuman: output.waitingForHuman === true,
    };
  },
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
  redactOutput(output) {
    return {
      ok: output.ok === true,
      intentSlug: output.intentSlug ?? null,
      candidateCount: output.candidateCount ?? 0,
    };
  },
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
            recommendationId: candidate.recommendationId,
            isNewRecommendation: candidate.isNewRecommendation === true,
            candidateHandle: candidate.candidateHandle,
            compatibility: candidate.compatibility,
            untrustedParticipantData: candidate.untrustedParticipantData,
            contentPolicy: candidate.contentPolicy,
            expiresAt: candidate.expiresAt,
          }))
      : [];
    await markDiscoveryRecommendationSources(
      candidates
        .map((candidate) => candidate.recommendationId)
        .filter((id): id is string => typeof id === "string"),
      context.jobId,
    );
    if (context.trigger === "scheduled" && candidates.length > 0) {
      await notifyForDiscoveryRecommendations({
        userId: context.actor.user.id,
        intentSlug: String(input.intentSlug),
        count: candidates.length,
        sourceJobId: context.jobId,
      });
    }
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
  redactOutput(output) {
    return {
      ok: output.ok === true,
      threadId: output.threadId ?? null,
      intentSlug: output.intentSlug ?? null,
      missingFieldCount: Array.isArray(output.missingFields)
        ? output.missingFields.length
        : 0,
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
  redactOutput(output) {
    return {
      ok: output.ok === true,
      threadId: output.threadId ?? null,
      intentSlug: output.intentSlug ?? null,
      enrollmentId: output.enrollmentId ?? null,
      approvalRequired: output.approvalRequired === true,
    };
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
    const candidateHandle = optionalString(payload, "candidateHandle", 1_000);
    const recommendationId = optionalString(payload, "recommendationId", 100);
    if (Boolean(candidateHandle) === Boolean(recommendationId)) {
      throw new SageCapabilityError(
        "Provide exactly one candidateHandle or recommendationId",
      );
    }
    return {
      candidateHandle,
      recommendationId,
    };
  },
  redactInput(input) {
    return {
      hasCandidateHandle: Boolean(input.candidateHandle),
      hasRecommendationId: Boolean(input.recommendationId),
    };
  },
  redactOutput(output) {
    return {
      ok: output.ok === true,
      status: output.status ?? null,
      waitingForHuman: output.waitingForHuman === true,
    };
  },
  async execute(context, input) {
    try {
      const actor = { user: context.actor.user, kind: "hosted_agent" as const };
      const candidateHandle = input.recommendationId
        ? await materializeDiscoveryRecommendation({
            actor,
            recommendationId: String(input.recommendationId),
          })
        : String(input.candidateHandle);
      const result = await requestDiscoveryIntroduction({
        actor,
        candidateHandle,
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

const coordinateEvent: SageCapabilityDefinition = {
  name: "coordinate_event",
  version: 1,
  description:
    "Create an idempotent event, list a person's events, or review the safely projected event board. Locking, cancellation, and booking remain human-only.",
  humanApproval: "policy",
  parseInput(payload) {
    const action = requiredString(payload, "action", 40);
    if (action === "list") {
      return {
        action,
        archived: optionalBoolean(payload, "archived") ?? false,
        limit: optionalInteger(payload, "limit", 1, 50) ?? 20,
        origin: optionalString(payload, "origin", 500),
      };
    }
    if (action === "review") {
      return {
        action,
        eventRef: requiredString(payload, "eventRef", 500),
        origin: optionalString(payload, "origin", 500),
      };
    }
    if (
      [
        "add_option",
        "respond",
        "post_note",
        "extend_deadline",
        "nudge",
        "set_notifications",
      ].includes(action)
    ) {
      const base = {
        action,
        eventRef: requiredString(payload, "eventRef", 500),
        origin: optionalString(payload, "origin", 500),
      };
      if (action === "add_option") {
        return {
          ...base,
          dimensionId: requiredString(payload, "dimensionId", 100),
          startsAt: optionalString(payload, "startsAt", 80),
          endsAt: optionalString(payload, "endsAt", 80),
          label: optionalString(payload, "label", 120),
        };
      }
      if (action === "respond") {
        const entries = Array.isArray(payload.entries)
          ? payload.entries.slice(0, 20).map((value, index) => {
              const entry = record(value);
              if (!entry || typeof entry.optionId !== "string") {
                throw new SageCapabilityError(
                  `entries[${index}].optionId is required`,
                );
              }
              if (!["yes", "no", "maybe"].includes(String(entry.value))) {
                throw new SageCapabilityError(
                  `entries[${index}].value must be yes, no, or maybe`,
                );
              }
              return { optionId: entry.optionId, value: entry.value };
            })
          : [];
        const attendance = optionalString(payload, "attendance", 10);
        if (
          attendance !== undefined &&
          !["yes", "no", "maybe"].includes(attendance)
        ) {
          throw new SageCapabilityError(
            "attendance must be yes, no, or maybe",
          );
        }
        if (!entries.length && !attendance) {
          throw new SageCapabilityError(
            "respond requires entries, attendance, or both",
          );
        }
        return { ...base, entries, attendance };
      }
      if (action === "post_note") {
        const audience = optionalString(payload, "audience", 20) ?? "everyone";
        if (!["everyone", "organizer"].includes(audience)) {
          throw new SageCapabilityError(
            "audience must be everyone or organizer",
          );
        }
        return {
          ...base,
          body: requiredString(payload, "body", 500),
          audience,
          optionId: optionalString(payload, "optionId", 100),
        };
      }
      if (action === "extend_deadline") {
        return {
          ...base,
          deadlineAt: requiredString(payload, "deadlineAt", 80),
        };
      }
      if (action === "set_notifications") {
        return {
          ...base,
          notify: optionalBoolean(payload, "notify") ?? true,
        };
      }
      return base;
    }
    if (action !== "create") {
      throw new SageCapabilityError(
        "Unsupported coordinate_event action",
      );
    }
    const slots = Array.isArray(payload.slots)
      ? payload.slots.slice(0, 20).map((value, index) => {
          const slot = record(value);
          if (!slot || typeof slot.startsAt !== "string") {
            throw new SageCapabilityError(
              `slots[${index}].startsAt is required`,
            );
          }
          return {
            startsAt: slot.startsAt,
            endsAt:
              typeof slot.endsAt === "string" ? slot.endsAt : undefined,
          };
        })
      : [];
    const visibility = optionalString(payload, "visibility", 20);
    if (
      visibility !== undefined &&
      !["open", "counts_only", "blind"].includes(visibility)
    ) {
      throw new SageCapabilityError(
        "visibility must be open, counts_only, or blind",
      );
    }
    const lockPolicy = optionalString(payload, "lockPolicy", 20);
    if (
      lockPolicy !== undefined &&
      !["on_quorum", "at_deadline", "manual"].includes(lockPolicy)
    ) {
      throw new SageCapabilityError(
        "lockPolicy must be on_quorum, at_deadline, or manual",
      );
    }
    return {
      action,
      title: requiredString(payload, "title", 120),
      description: optionalString(payload, "description", 2_000),
      timezone: optionalString(payload, "timezone", 64),
      visibility,
      lockPolicy,
      quorumMin: optionalInteger(payload, "quorumMin", 1, 200),
      capacityMax: optionalInteger(payload, "capacityMax", 1, 200),
      deadlineAt: optionalString(payload, "deadlineAt", 80),
      allowChat: optionalBoolean(payload, "allowChat"),
      allowGuestOptions: optionalBoolean(payload, "allowGuestOptions"),
      place: optionalString(payload, "place", 120),
      slots,
      fixedStartsAt: optionalString(payload, "fixedStartsAt", 80),
      fixedEndsAt: optionalString(payload, "fixedEndsAt", 80),
      origin: optionalString(payload, "origin", 500),
    };
  },
  redactInput(input) {
    return {
      action: input.action,
      archived: input.archived ?? null,
      limit: input.limit ?? null,
      hasEventRef: Boolean(input.eventRef),
      hasTitle: Boolean(input.title),
      hasDescription: Boolean(input.description),
      slotCount: Array.isArray(input.slots) ? input.slots.length : 0,
      hasFixedTime: Boolean(input.fixedStartsAt),
      hasPlace: Boolean(input.place),
      hasDimensionId: Boolean(input.dimensionId),
      responseCount: Array.isArray(input.entries) ? input.entries.length : 0,
      hasAttendance: Boolean(input.attendance),
      hasNote: Boolean(input.body),
      noteAudience: input.audience ?? null,
      hasDeadline: Boolean(input.deadlineAt),
    };
  },
  redactOutput(output) {
    return {
      ok: output.ok === true,
      action: output.action ?? null,
      eventId: output.eventId ?? null,
      organizedCount: output.organizedCount ?? null,
      joinedCount: output.joinedCount ?? null,
    };
  },
  async execute(context, input) {
    if (!eventsFeatureEnabled()) {
      throw new SageCapabilityError("Events are temporarily unavailable", true);
    }
    const origin = String(input.origin ?? appOrigin()).replace(/\/$/, "");
    try {
      if (input.action === "list") {
        const page = await listEventsForUser(context.actor.user, {
          archived: input.archived === true,
          limit: Number(input.limit ?? 20),
        });
        const shape = (event: (typeof page.organized)[number]) => ({
          id: event.id,
          title: event.title,
          status: event.status,
          deadlineAt: event.deadlineAt.toISOString(),
          shareUrl: `${origin}/e/${event.shareSlug}`,
        });
        return {
          state: "completed",
          result: {
            ok: true,
            action: "list",
            organizedCount: page.organized.length,
            joinedCount: page.joined.length,
            hasMore: page.hasMore,
            organized: page.organized.map(shape),
            joined: page.joined.map(shape),
          },
        };
      }
      if (input.action === "review") {
        const event = await resolveEventRef(input.eventRef);
        const board = await boardFor(event.id, context.actor.user);
        return {
          state: "completed",
          result: {
            ok: true,
            action: "review",
            eventId: event.id,
            shareUrl: `${origin}/e/${event.shareSlug}`,
            board,
          },
        };
      }
      if (input.action !== "create") {
        const event = await resolveEventRef(input.eventRef);
        const idempotencyKey = `sage:${context.jobId}`;
        if (input.action === "add_option") {
          const organizer = event.organizerUserId === context.actor.user.id;
          if (!organizer) {
            const [participant] = await getDb()
              .select({ id: eventParticipants.id })
              .from(eventParticipants)
              .where(
                and(
                  eq(eventParticipants.eventId, event.id),
                  eq(eventParticipants.userId, context.actor.user.id),
                ),
              )
              .limit(1);
            if (!participant) {
              throw new AgentApiError(
                403,
                "Join this event before suggesting an option.",
              );
            }
          }
          await addOption(
            event,
            context.actor.user,
            {
              dimensionId: String(input.dimensionId),
              startsAt:
                typeof input.startsAt === "string" ? input.startsAt : undefined,
              endsAt:
                typeof input.endsAt === "string" ? input.endsAt : undefined,
              label: typeof input.label === "string" ? input.label : undefined,
              idempotencyKey,
            },
            organizer ? "organizer" : "participant",
          );
        } else if (input.action === "respond") {
          const participant = await joinEvent(event, context.actor.user);
          await setResponses(
            event,
            participant,
            input.entries as ResponseEntry[],
            input.attendance as EventPref | undefined,
            { idempotencyKey },
          );
        } else if (input.action === "post_note") {
          const [existing] = await getDb()
            .select()
            .from(eventParticipants)
            .where(
              and(
                eq(eventParticipants.eventId, event.id),
                eq(eventParticipants.userId, context.actor.user.id),
              ),
            )
            .limit(1);
          const participant =
            existing ??
            (event.organizerUserId === context.actor.user.id
              ? null
              : await joinEvent(event, context.actor.user));
          await publishNote({
            event,
            user: context.actor.user,
            participant,
            input: {
              body: String(input.body),
              visibility: input.audience as "everyone" | "organizer",
              optionId:
                typeof input.optionId === "string" ? input.optionId : null,
              source: "chat",
              idempotencyKey,
            },
          });
        } else if (input.action === "extend_deadline") {
          await extendDeadline(event, context.actor.user, String(input.deadlineAt), {
            idempotencyKey,
          });
        } else if (input.action === "nudge") {
          assertOrganizer(event, context.actor.user);
          await enqueueEventNotification({
            eventId: event.id,
            template: "deadline_soon",
            dedupeKey: `nudge:${event.id}:${idempotencyKey}`,
            payload: { title: event.title, hours: "a few" },
            toAllParticipants: true,
          });
        } else if (input.action === "set_notifications") {
          await setNotifyUpdates(
            event,
            context.actor.user,
            input.notify !== false,
          );
        }
        return {
          state: "completed",
          result: {
            ok: true,
            action: input.action,
            eventId: event.id,
            shareUrl: `${origin}/e/${event.shareSlug}`,
            board: await boardFor(event.id, context.actor.user),
            message: "Sage updated the event without making the final decision for you.",
          },
        };
      }
      const event = await createEvent(
        context.actor.user,
        {
          ...(input as CreateEventInput),
          idempotencyKey: `sage:${context.jobId}`,
        },
        { kind: "hosted_agent" },
      );
      return {
        state: "completed",
        result: {
          ok: true,
          action: "create",
          eventId: event.id,
          title: event.title,
          status: event.status,
          deadlineAt: event.deadlineAt.toISOString(),
          shareUrl: `${origin}/e/${event.shareSlug}`,
          message:
            "Sage created the event. Share the link when you are ready. Locking, cancellation, and booking stay in your hands.",
        },
      };
    } catch (error) {
      withAgentErrorBoundary(error);
    }
  },
};

const eventChat: SageCapabilityDefinition = {
  name: "event_chat",
  version: 1,
  description:
    "Run one durable, role-scoped hosted event turn. The model sees only the caller's projected board and cannot lock, cancel, confirm, or book.",
  humanApproval: "policy",
  parseInput(payload) {
    return {
      eventId: requiredString(payload, "eventId", 100),
      message: requiredString(payload, "message", 1_000),
    };
  },
  redactInput(input) {
    return {
      eventId: input.eventId,
      messageLength:
        typeof input.message === "string" ? input.message.length : 0,
    };
  },
  redactOutput(output) {
    return {
      ok: output.ok === true,
      eventId: output.eventId ?? null,
      appliedCount: Array.isArray(output.applied) ? output.applied.length : 0,
      hasReply: typeof output.reply === "string",
      turnsRemaining: output.turnsRemaining ?? null,
    };
  },
  async execute(context, input) {
    try {
      const event = await eventById(String(input.eventId));
      const organizer = event.organizerUserId === context.actor.user.id;
      const existing = await participantFor(event, context.actor.user);
      const participant = organizer
        ? null
        : (existing ?? (await joinEvent(event, context.actor.user)));
      const turn = await runEventChatTurn({
        event,
        user: context.actor.user,
        participant,
        role: organizer ? "organizer" : "participant",
        message: String(input.message),
        idempotencyKey: `sage:${context.jobId}`,
      });
      return {
        state: "completed",
        result: {
          ok: true,
          eventId: event.id,
          reply: turn.reply,
          board: turn.board,
          applied: turn.applied,
          turnsRemaining: Number.isFinite(turn.turnsRemaining)
            ? turn.turnsRemaining
            : null,
        },
        telemetry: turn.telemetry,
      };
    } catch (error) {
      withAgentErrorBoundary(error);
    }
  },
};

const runGuestRequest: SageCapabilityDefinition = {
  name: "run_guest_request",
  version: 1,
  description:
    "Create a private no-account guest request without sending it, then monitor privacy-preserving responses for human review.",
  humanApproval: "policy",
  parseInput(payload) {
    const action = requiredString(payload, "action", 40);
    if (action === "list") return { action };
    if (action === "review") {
      return {
        action,
        publicId: requiredString(payload, "publicId", 100),
      };
    }
    if (action === "create") {
      const taskType = requiredString(payload, "taskType", 40);
      if (
        ![
          "binary_choice",
          "text_response",
          "availability",
          "hiring_compatibility",
        ].includes(taskType)
      ) {
        throw new SageCapabilityError(
          "taskType must be binary_choice, text_response, availability, or hiring_compatibility",
        );
      }
      return {
        action,
        taskType,
        title: requiredString(payload, "title", 120),
        description: optionalString(payload, "description", 2_000),
        config: record(payload.config) ?? {},
        privateConfig: record(payload.privateConfig) ?? {},
        targetEmail: requiredString(payload, "targetEmail", 320),
        expiresInMinutes:
          optionalInteger(payload, "expiresInMinutes", 15, 43_200) ??
          7 * 24 * 60,
        maxResponses:
          optionalInteger(payload, "maxResponses", 1, 20) ?? 1,
        sessionId: optionalString(payload, "sessionId", 100),
        origin: optionalString(payload, "origin", 500),
      };
    }
    throw new SageCapabilityError(
      "run_guest_request action must be create, list, or review",
    );
  },
  redactInput(input) {
    return {
      action: input.action,
      taskType: input.taskType ?? null,
      hasPublicId: Boolean(input.publicId),
      hasTitle: Boolean(input.title),
      hasDescription: Boolean(input.description),
      hasTargetEmail: Boolean(input.targetEmail),
      hasPrivateConfig:
        Boolean(input.privateConfig) &&
        Object.keys(record(input.privateConfig) ?? {}).length > 0,
    };
  },
  redactOutput(output) {
    return {
      ok: output.ok === true,
      action: output.action ?? null,
      publicId: output.publicId ?? null,
      taskCount: output.taskCount ?? null,
      responseCount: output.responseCount ?? null,
    };
  },
  async execute(context, input) {
    try {
      if (input.action === "create") {
        const created = await createGuestTask({
          organizer: context.actor.user,
          taskType: input.taskType,
          title: input.title,
          description: input.description,
          config: input.config,
          privateConfig: input.privateConfig,
          targetEmail: input.targetEmail,
          expiresInMinutes: input.expiresInMinutes,
          maxResponses: input.maxResponses,
          sessionId: input.sessionId,
          origin: String(input.origin ?? appOrigin()),
          actor: { kind: "hosted_agent" },
          idempotencyKey: `sage:${context.jobId}`,
        });
        return {
          state: "completed",
          result: {
            ok: true,
            action: "create",
            publicId: created.task.publicId,
            task: created.task,
            guestUrl: created.guestUrl,
            warning: created.warning,
            message:
              "Sage created the private request but did not contact anyone. Review and share the link yourself.",
          },
        };
      }
      if (input.action === "list") {
        const tasks = await listGuestTasksForOrganizer(context.actor.user);
        return {
          state: "completed",
          result: {
            ok: true,
            action: "list",
            taskCount: tasks.length,
            tasks,
          },
        };
      }
      const reviewed = await getGuestTaskForOrganizer(
        context.actor.user,
        String(input.publicId),
      );
      return {
        state: "completed",
        result: {
          ok: true,
          action: "review",
          task: reviewed.task,
          responseCount: reviewed.responses.length,
          responses: reviewed.responses,
          message: reviewed.responses.length
            ? "Sage found responses ready for your review. Private candidate values remain hidden."
            : "No response has arrived yet.",
        },
      };
    } catch (error) {
      withAgentErrorBoundary(error);
    }
  },
};

const manageConnections: SageCapabilityDefinition = {
  name: "manage_connections",
  version: 1,
  description:
    "Review relationships or create a private invitation link without sending it. Approval, revocation, and policy changes remain human-controlled.",
  humanApproval: "policy",
  parseInput(payload) {
    const action = requiredString(payload, "action", 40);
    if (action === "review") {
      return { action, origin: optionalString(payload, "origin", 500) };
    }
    if (action === "create_invite") {
      return {
        action,
        toEmail: requiredString(payload, "toEmail", 320),
        toName: optionalString(payload, "toName", 80),
        confirmRequired: optionalBoolean(payload, "confirmRequired") ?? true,
        expiresInHours:
          optionalInteger(payload, "expiresInHours", 1, 720) ?? 168,
        origin: optionalString(payload, "origin", 500),
      };
    }
    throw new SageCapabilityError(
      "manage_connections action must be review or create_invite",
    );
  },
  redactInput(input) {
    return {
      action: input.action,
      hasRecipientEmail: Boolean(input.toEmail),
      hasRecipientName: Boolean(input.toName),
      confirmRequired: input.confirmRequired ?? null,
    };
  },
  redactOutput(output) {
    return {
      ok: output.ok === true,
      action: output.action ?? null,
      connectionCount: output.connectionCount ?? 0,
      metCount: output.metCount ?? 0,
      pendingCount: output.pendingCount ?? 0,
      linkId: output.linkId ?? null,
    };
  },
  async execute(context, input) {
    try {
      const origin = String(input.origin ?? appOrigin()).replace(/\/$/, "");
      if (input.action === "create_invite") {
        const link = await createInviteLink({
          fromUser: context.actor.user,
          toEmail: String(input.toEmail),
          toName: typeof input.toName === "string" ? input.toName : undefined,
          confirmRequired: input.confirmRequired !== false,
          expiresInHours: Number(input.expiresInHours ?? 168),
          origin,
        });
        return {
          state: "completed",
          result: {
            ok: true,
            action: "create_invite",
            linkId: link.id,
            link,
            message:
              "Sage created the private invitation but did not send it. Review and share the link yourself.",
          },
        };
      }
      const links = await listLinksForUser(context.actor.user, origin);
      const linkedIds = new Set(
        links
          .map((link) => link.peer?.id)
          .filter((id): id is string => Boolean(id)),
      );
      const met = await listPeopleMetThroughEvents(context.actor.user, {
        excludeUserIds: linkedIds,
        limit: 50,
      });
      return {
        state: "completed",
        result: {
          ok: true,
          action: "review",
          connectionCount: links.filter((link) => link.status === "active").length,
          pendingCount: links.filter((link) => link.status === "pending").length,
          metCount: met.length,
          links,
          met,
          message:
            "Sage reviewed your people. You still approve, revoke, and change relationship permissions yourself.",
        },
      };
    } catch (error) {
      withAgentErrorBoundary(error);
    }
  },
};

const reviewActivity: SageCapabilityDefinition = {
  name: "review_activity",
  version: 1,
  description:
    "Review or acknowledge inbox work, inspect a coordination session, or read a safely projected event board without taking consequential actions.",
  humanApproval: "never",
  parseInput(payload) {
    const action = optionalString(payload, "action", 40) ?? "overview";
    if (action === "ack") {
      return {
        action,
        inboxId: requiredString(payload, "inboxId", 100),
      };
    }
    if (action === "session") {
      return {
        action,
        sessionId: requiredString(payload, "sessionId", 100),
      };
    }
    if (action === "event") {
      return {
        action,
        eventRef: requiredString(payload, "eventRef", 500),
      };
    }
    if (action !== "overview") {
      throw new SageCapabilityError(
        "review_activity action must be overview, ack, session, or event",
      );
    }
    return {
      action,
      pendingOnly: optionalBoolean(payload, "pendingOnly") ?? true,
      limit: optionalInteger(payload, "limit", 1, 50) ?? 20,
    };
  },
  redactInput(input) {
    return {
      action: input.action,
      pendingOnly: input.pendingOnly ?? null,
      limit: input.limit ?? null,
      hasInboxId: Boolean(input.inboxId),
      hasSessionId: Boolean(input.sessionId),
      hasEventRef: Boolean(input.eventRef),
    };
  },
  redactOutput(output) {
    return {
      ok: output.ok === true,
      inboxCount: output.inboxCount ?? 0,
      sessionCount: output.sessionCount ?? 0,
      inboxId: output.inboxId ?? null,
      sessionId: output.sessionId ?? null,
      eventId: output.eventId ?? null,
    };
  },
  async execute(context, input) {
    try {
      if (input.action === "ack") {
        const item = await ackInboxItem({
          user: context.actor.user,
          inboxId: String(input.inboxId),
        });
        return {
          state: "completed",
          result: {
            ok: true,
            action: "ack",
            inboxId: item.id,
            item,
            message: "Sage marked this activity item reviewed.",
          },
        };
      }
      if (input.action === "session") {
        const session = await getSessionForUser(
          String(input.sessionId),
          context.actor.user.id,
        );
        const messages = await listMessagesForSession(session.id);
        return {
          state: "completed",
          result: {
            ok: true,
            action: "session",
            sessionId: session.id,
            session,
            messages,
          },
        };
      }
      if (input.action === "event") {
        const event = await resolveEventRef(input.eventRef);
        return {
          state: "completed",
          result: {
            ok: true,
            action: "event",
            eventId: event.id,
            board: await boardFor(event.id, context.actor.user),
          },
        };
      }
      const [inbox, sessions] = await Promise.all([
        listInboxForUser(context.actor.user.id, {
          pendingOnly: input.pendingOnly === true,
          limit: Number(input.limit ?? 20),
        }),
        listSessionsForUser(context.actor.user),
      ]);
      const limitedSessions = sessions.slice(0, Number(input.limit ?? 20));
      return {
        state: "completed",
        result: {
          ok: true,
          inboxCount: inbox.length,
          sessionCount: limitedSessions.length,
          inbox,
          sessions: limitedSessions,
          message: inbox.length
            ? `Sage found ${inbox.length} item${inbox.length === 1 ? "" : "s"} that may need your attention.`
            : "There is no pending agent activity right now.",
        },
      };
    } catch (error) {
      withAgentErrorBoundary(error);
    }
  },
};

const registry: Record<SageCapabilityName, SageCapabilityDefinition> = {
  schedule_meeting: scheduleMeeting,
  discovery_search: discoverySearch,
  discovery_intake: discoveryIntake,
  discovery_prepare_enrollment: discoveryPrepareEnrollment,
  discovery_stage_introduction: discoveryStageIntroduction,
  event_chat: eventChat,
  coordinate_event: coordinateEvent,
  run_guest_request: runGuestRequest,
  manage_connections: manageConnections,
  review_activity: reviewActivity,
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
