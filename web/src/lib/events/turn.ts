/**
 * The turn executor.
 *
 * One place where model output becomes a database write. Every tool call is
 * schema-checked and role-checked against the caller's real identity before it
 * is applied, so nothing the model emits can exceed what the caller could do
 * by hand in the UI.
 */

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  eventMessages,
  eventParticipants,
  events,
  type Event,
  type EventParticipant,
  type User,
} from "@/db/schema";
import { AgentApiError } from "@/lib/agent-errors";
import { getLlmProvider, hostedAgentAvailable, type LlmToolCall } from "@/lib/llm";
import {
  GuardrailError,
  REFUSAL_MESSAGE,
  boundReply,
  validateParticipantInput,
} from "@/lib/events/guardrails";
import {
  buildOrganizerSystemPrompt,
  buildParticipantSystemPrompt,
} from "@/lib/events/context";
import {
  HUMAN_ONLY_ACTIONS,
  isToolAllowed,
  organizerToolDefs,
  participantToolDefs,
  type EventToolRole,
} from "@/lib/events/tools";
import {
  addOption,
  extendDeadline,
  recordActivity,
  setResponses,
} from "@/lib/events/service";
import { boardFor } from "@/lib/events/access";
import { displayName } from "@/lib/events/copy";
import type { EventBoard } from "@/lib/events/types";

export const DEFAULT_TURN_CAP = 12;

export function chatTurnCap(): number {
  const configured = Number(process.env.EVENT_CHAT_TURN_CAP);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_TURN_CAP;
}

export type TurnResult = {
  reply: string;
  board: EventBoard;
  applied: string[];
  turnsRemaining: number;
};

async function threadHistory(
  eventId: string,
  participantId: string | null,
  limit = 12,
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(eventMessages)
    .where(
      participantId
        ? and(
            eq(eventMessages.eventId, eventId),
            eq(eventMessages.participantId, participantId),
          )
        : eq(eventMessages.eventId, eventId),
    )
    .orderBy(asc(eventMessages.createdAt))
    .limit(60);

  const scoped = participantId
    ? rows
    : rows.filter((row) => row.participantId === null);
  return scoped.slice(-limit);
}

async function persistMessage(entry: {
  eventId: string;
  participantId: string | null;
  role: string;
  text: string;
  toolCalls?: unknown[];
  tokensIn?: number;
  tokensOut?: number;
}) {
  const db = getDb();
  await db.insert(eventMessages).values({
    eventId: entry.eventId,
    participantId: entry.participantId,
    role: entry.role,
    text: entry.text,
    toolCalls: entry.toolCalls ?? [],
    tokensIn: entry.tokensIn ?? 0,
    tokensOut: entry.tokensOut ?? 0,
  });
}

async function logAnomaly(
  eventId: string,
  userId: string,
  detail: Record<string, unknown>,
) {
  await recordActivity({
    eventId,
    actorUserId: userId,
    kind: "anomaly",
    summary: "A chat turn attempted something it is not allowed to do.",
    body: detail,
  });
  const { writeAudit } = await import("@/lib/audit");
  await writeAudit({
    actorUserId: userId,
    actorKind: "agent",
    action: "event.chat.anomaly",
    entityType: "event",
    entityId: eventId,
    metadata: detail,
  });
}

/**
 * Apply one validated tool call. Returns a short label when it changed state.
 * Anything not explicitly handled is rejected, never silently ignored.
 */
async function applyToolCall(opts: {
  call: LlmToolCall;
  role: EventToolRole;
  event: Event;
  user: User;
  participant: EventParticipant | null;
}): Promise<{ applied: string | null; reply: string | null }> {
  const { call, role, event, user, participant } = opts;
  const args = call.args ?? {};

  if (HUMAN_ONLY_ACTIONS.includes(call.name as (typeof HUMAN_ONLY_ACTIONS)[number])) {
    await logAnomaly(event.id, user.id, { tool: call.name, reason: "human_only" });
    return { applied: null, reply: null };
  }
  if (!isToolAllowed(role, call.name)) {
    await logAnomaly(event.id, user.id, { tool: call.name, reason: "role_denied", role });
    return { applied: null, reply: null };
  }

  switch (call.name) {
    case "reply":
      return { applied: null, reply: boundReply(String(args.text ?? "")) };

    case "set_option_preference": {
      if (!participant) return { applied: null, reply: null };
      const optionId = String(args.optionId ?? "");
      const value = String(args.value ?? "");
      if (!optionId || !["yes", "no", "maybe"].includes(value)) {
        return { applied: null, reply: null };
      }
      await setResponses(event, participant, [
        { optionId, value: value as "yes" | "no" | "maybe" },
      ]);
      return { applied: `preference:${value}`, reply: null };
    }

    case "set_attendance": {
      if (!participant) return { applied: null, reply: null };
      const value = String(args.value ?? "");
      if (!["yes", "no", "maybe"].includes(value)) {
        return { applied: null, reply: null };
      }
      await setResponses(event, participant, [], value as "yes" | "no" | "maybe");
      return { applied: `attendance:${value}`, reply: null };
    }

    case "propose_option": {
      if (!event.allowGuestOptions) return { applied: null, reply: null };
      const dimensionId = String(args.dimensionId ?? "");
      if (!dimensionId) return { applied: null, reply: null };
      await addOption(
        event,
        user,
        {
          dimensionId,
          startsAt: args.startsAt ? String(args.startsAt) : undefined,
          label: args.label ? String(args.label) : undefined,
        },
        "participant",
      );
      return { applied: "option_proposed", reply: null };
    }

    case "add_option": {
      const dimensionId = String(args.dimensionId ?? "");
      if (!dimensionId) return { applied: null, reply: null };
      await addOption(
        event,
        user,
        {
          dimensionId,
          startsAt: args.startsAt ? String(args.startsAt) : undefined,
          label: args.label ? String(args.label) : undefined,
        },
        "organizer",
      );
      return { applied: "option_added", reply: null };
    }

    case "extend_deadline": {
      const deadlineAt = String(args.deadlineAt ?? "");
      if (!deadlineAt) return { applied: null, reply: null };
      await extendDeadline(event, user, deadlineAt);
      return { applied: "deadline_extended", reply: null };
    }

    case "ask_organizer": {
      const question = String(args.question ?? "").slice(0, 600);
      if (!question) return { applied: null, reply: null };
      await recordActivity({
        eventId: event.id,
        actorUserId: user.id,
        kind: "question_asked",
        summary: `${displayName(user.name, user.email)} asked: ${question}`,
        body: { question },
      });
      const { enqueueEventNotification } = await import("@/lib/events/notify");
      await enqueueEventNotification({
        eventId: event.id,
        template: "organizer_digest",
        dedupeKey: `question:${event.id}:${user.id}:${Date.now()}`,
        payload: { title: event.title, summary: `New question: ${question}` },
        toOrganizerOnly: true,
      });
      return { applied: "question_sent", reply: null };
    }

    default:
      await logAnomaly(event.id, user.id, { tool: call.name, reason: "unknown_tool" });
      return { applied: null, reply: null };
  }
}

export async function runEventChatTurn(opts: {
  event: Event;
  user: User;
  participant: EventParticipant | null;
  role: EventToolRole;
  message: string;
}): Promise<TurnResult> {
  const { event, user, role } = opts;
  const db = getDb();

  if (!event.allowChat) {
    throw new AgentApiError(403, "Chat is turned off for this event.");
  }
  if (!hostedAgentAvailable()) {
    throw new AgentApiError(
      503,
      "The assistant is unavailable right now. You can still tap your answer above.",
    );
  }

  let participant = opts.participant;

  // Turn cap: participants only. The organizer's own thread is metered by the
  // route's rate limiter instead.
  if (role === "participant") {
    if (!participant) {
      throw new AgentApiError(403, "Join this event before chatting.");
    }
    const cap = chatTurnCap();
    if (participant.chatTurnsUsed >= cap) {
      throw new AgentApiError(
        429,
        `I've passed this to ${event.agentName === "Sage" ? "the organizer" : event.agentName}. Tap your answer above if anything changes.`,
      );
    }
  }

  let text: string;
  try {
    text = validateParticipantInput(opts.message);
  } catch (error) {
    if (error instanceof GuardrailError) {
      await persistMessage({
        eventId: event.id,
        participantId: participant?.id ?? null,
        role: "system",
        text: `blocked: ${error.message}`,
      });
      await logAnomaly(event.id, user.id, {
        reason: "guardrail",
        detail: error.message,
      });
      return {
        reply: REFUSAL_MESSAGE,
        board: await boardFor(event.id, user),
        applied: [],
        turnsRemaining: Math.max(
          0,
          chatTurnCap() - (participant?.chatTurnsUsed ?? 0),
        ),
      };
    }
    throw error;
  }

  const board = await boardFor(event.id, user);
  const system =
    role === "organizer"
      ? buildOrganizerSystemPrompt(board)
      : buildParticipantSystemPrompt(board);
  const tools =
    role === "organizer"
      ? organizerToolDefs()
      : participantToolDefs(event.allowGuestOptions);

  const history = await threadHistory(event.id, participant?.id ?? null);
  const messages = [
    ...history.map((row) => ({
      role: (row.role === "agent" ? "model" : "user") as "user" | "model",
      text: row.text,
    })),
    { role: "user" as const, text },
  ];

  await persistMessage({
    eventId: event.id,
    participantId: participant?.id ?? null,
    role: role === "organizer" ? "organizer" : "participant",
    text,
  });

  let result;
  try {
    result = await getLlmProvider().complete({
      system,
      messages,
      tools,
      maxOutputTokens: 400,
    });
  } catch (error) {
    console.error("[events] chat turn failed", error);
    throw new AgentApiError(
      503,
      "The assistant could not respond. Your tapped answers are still saved.",
    );
  }

  const applied: string[] = [];
  let reply: string | null = null;
  for (const call of result.toolCalls) {
    try {
      const outcome = await applyToolCall({
        call,
        role,
        event,
        user,
        participant,
      });
      if (outcome.applied) applied.push(outcome.applied);
      if (outcome.reply) reply = outcome.reply;
    } catch (error) {
      // A rejected write is normal (closed event, bad id) — tell the person
      // rather than failing the turn.
      reply =
        reply ??
        (error instanceof AgentApiError
          ? error.message
          : "I couldn't save that. Try tapping your answer above.");
    }
  }

  reply = reply ?? boundReply(result.text) ?? REFUSAL_MESSAGE;

  await persistMessage({
    eventId: event.id,
    participantId: participant?.id ?? null,
    role: "agent",
    text: reply,
    toolCalls: result.toolCalls as unknown[],
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  });

  if (role === "participant" && participant) {
    const [updated] = await db
      .update(eventParticipants)
      .set({ chatTurnsUsed: participant.chatTurnsUsed + 1, lastSeenAt: new Date() })
      .where(eq(eventParticipants.id, participant.id))
      .returning();
    participant = updated ?? participant;
  }

  void events;

  return {
    reply,
    board: await boardFor(event.id, user),
    applied,
    turnsRemaining:
      role === "participant"
        ? Math.max(0, chatTurnCap() - (participant?.chatTurnsUsed ?? 0))
        : Number.POSITIVE_INFINITY,
  };
}

export async function loadThread(
  eventId: string,
  participantId: string | null,
) {
  const rows = await threadHistory(eventId, participantId, 40);
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  }));
}
