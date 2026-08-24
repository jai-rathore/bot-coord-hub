/**
 * The turn executor.
 *
 * One place where model output becomes a database write. Every tool call is
 * schema-checked and role-checked against the caller's real identity before it
 * is applied, so nothing the model emits can exceed what the caller could do
 * by hand in the UI.
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  eventDimensions,
  eventMessages,
  eventParticipants,
  events,
  type Event,
  type EventParticipant,
  type User,
} from "@/db/schema";
import { AgentApiError } from "@/lib/agent-errors";
import {
  getLlmProvider,
  hostedAgentAvailable,
  type LlmProvider,
  type LlmToolCall,
} from "@/lib/llm";
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
  publishNote,
  recordActivity,
  removeNoteAndRefresh,
  retractNoteAndRefresh,
  setResponses,
} from "@/lib/events/service";
import { isNoteVisibility, type NoteVisibility } from "@/lib/events/notes";
import { boardFor } from "@/lib/events/access";
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
  telemetry?: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  };
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
  provider?: string | null;
  model?: string | null;
  idempotencyKey?: string | null;
}) {
  const db = getDb();
  const [created] = await db
    .insert(eventMessages)
    .values({
      eventId: entry.eventId,
      participantId: entry.participantId,
      role: entry.role,
      text: entry.text,
      toolCalls: entry.toolCalls ?? [],
      tokensIn: entry.tokensIn ?? 0,
      tokensOut: entry.tokensOut ?? 0,
      provider: entry.provider ?? null,
      model: entry.model ?? null,
      idempotencyKey: entry.idempotencyKey ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  if (entry.idempotencyKey) {
    const [replayed] = await db
      .select()
      .from(eventMessages)
      .where(
        and(
          eq(eventMessages.eventId, entry.eventId),
          eq(eventMessages.idempotencyKey, entry.idempotencyKey),
        ),
      )
      .limit(1);
    if (replayed) return replayed;
  }
  throw new AgentApiError(500, "Could not save this chat turn. Try again.");
}

async function countParticipantTurnOnce(
  messageId: string,
  participantId: string | null,
) {
  if (!participantId) return;
  await getDb().transaction(async (tx) => {
    const [claimed] = await tx
      .update(eventMessages)
      .set({ turnCounted: true })
      .where(
        and(
          eq(eventMessages.id, messageId),
          eq(eventMessages.turnCounted, false),
        ),
      )
      .returning({ id: eventMessages.id });
    if (!claimed) return;
    await tx
      .update(eventParticipants)
      .set({
        chatTurnsUsed: sql`${eventParticipants.chatTurnsUsed} + 1`,
        lastSeenAt: new Date(),
      })
      .where(eq(eventParticipants.id, participantId));
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
 * Where a suggested option lands. The model never sees dimension ids: a
 * hallucinated one used to make every proposal fail: so the server picks:
 * a time suggestion goes to the open time dimension, a bare label to an open
 * place/custom dimension, falling back to any open one.
 */
async function resolveOpenDimensionId(
  eventId: string,
  wantsTime: boolean,
): Promise<string | null> {
  const db = getDb();
  const dims = await db
    .select()
    .from(eventDimensions)
    .where(eq(eventDimensions.eventId, eventId));
  const open = dims.filter((d) => d.mode === "open");
  const preferred = wantsTime
    ? open.find((d) => d.kind === "time")
    : (open.find((d) => d.kind === "place" || d.kind === "custom") ??
      open.find((d) => d.kind === "time"));
  return (preferred ?? open[0])?.id ?? null;
}

/**
 * What the person reads when the model made changes but wrote no reply, or
 * said nothing at all. The old fallback was the guardrail refusal: so a
 * benign "how about Saturday?" that ended in a silent tool call read as a
 * security lecture.
 */
export function composeFallbackReply(
  applied: string[],
  role: EventToolRole,
  summary: string,
): string {
  if (applied.length > 0) {
    const parts: string[] = [];
    if (applied.some((a) => a.startsWith("preference:"))) {
      parts.push("saved your answers");
    }
    if (applied.some((a) => a.startsWith("attendance:"))) {
      parts.push("noted whether you're coming");
    }
    if (applied.includes("option_proposed")) {
      parts.push("added your suggestion for everyone to see");
    }
    if (applied.includes("option_added")) parts.push("added that option");
    if (applied.includes("deadline_extended")) parts.push("moved the deadline");
    if (applied.includes("question_sent")) {
      parts.push("passed your question to the organizer");
    }
    if (applied.includes("note_shared")) {
      parts.push("put your note on the event for everyone");
    }
    if (applied.includes("note_to_organizer")) {
      parts.push("sent your note to the organizer");
    }
    if (applied.includes("note_retracted")) parts.push("taken that note back");
    if (applied.includes("note_removed")) parts.push("removed that note");
    const done = parts.length > 0 ? parts.join(" and ") : "saved that";
    return `Done: I've ${done}. ${summary}`;
  }
  return role === "organizer"
    ? "I didn't catch that. You can ask me what's leading, who hasn't answered, or tell me a time or place to add."
    : "I didn't catch that. Tell me which of the listed times work for you, or name another time and I'll suggest it.";
}

/**
 * Fold anything the server has to say into the reply the person reads. The
 * model does not get to omit it: the notice describes what the board actually
 * did, which may not be what the model said it did.
 */
export function appendNotices(reply: string, notices: string[]): string {
  const unseen = notices.filter(
    (notice, index) =>
      notices.indexOf(notice) === index && !reply.includes(notice),
  );
  if (unseen.length === 0) return reply;
  return [reply, ...unseen].join(" ");
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
  idempotencyKey?: string;
}): Promise<{
  applied: string | null;
  reply: string | null;
  /** Something the person must be told regardless of what the model wrote. */
  notice?: string | null;
}> {
  const { call, role, event, user, participant, idempotencyKey } = opts;
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
        return {
          applied: null,
          reply:
            "I couldn't match that to one of the listed times. Tell me which one you meant, or tap it above.",
        };
      }
      await setResponses(event, participant, [
        { optionId, value: value as "yes" | "no" | "maybe" },
      ], undefined, { idempotencyKey });
      return { applied: `preference:${value}`, reply: null };
    }

    case "set_attendance": {
      if (!participant) return { applied: null, reply: null };
      const value = String(args.value ?? "");
      if (!["yes", "no", "maybe"].includes(value)) {
        return { applied: null, reply: null };
      }
      await setResponses(
        event,
        participant,
        [],
        value as "yes" | "no" | "maybe",
        { idempotencyKey },
      );
      return { applied: `attendance:${value}`, reply: null };
    }

    case "propose_option": {
      if (!event.allowGuestOptions) {
        return {
          applied: null,
          reply:
            "The organizer isn't taking extra suggestions on this one. I can pass it along as a question instead: want me to?",
        };
      }
      const startsAt = args.startsAt ? String(args.startsAt) : undefined;
      const label = args.label ? String(args.label) : undefined;
      if (!startsAt && !label) {
        return {
          applied: null,
          reply: "Tell me the time (or place) you'd like me to suggest.",
        };
      }
      const dimensionId = await resolveOpenDimensionId(
        event.id,
        Boolean(startsAt),
      );
      if (!dimensionId) {
        return {
          applied: null,
          reply:
            "This event's times are fixed, so I can't add another: but I can pass your preference to the organizer.",
        };
      }
      await addOption(
        event,
        user,
        { dimensionId, startsAt, label, idempotencyKey },
        "participant",
      );
      return { applied: "option_proposed", reply: null };
    }

    case "add_option": {
      const startsAt = args.startsAt ? String(args.startsAt) : undefined;
      const label = args.label ? String(args.label) : undefined;
      if (!startsAt && !label) {
        return {
          applied: null,
          reply: "Give me the time or the place you want added.",
        };
      }
      const dimensionId = await resolveOpenDimensionId(
        event.id,
        Boolean(startsAt),
      );
      if (!dimensionId) {
        return {
          applied: null,
          reply:
            "There's no open list to add to on this event: its options are fixed.",
        };
      }
      await addOption(
        event,
        user,
        { dimensionId, startsAt, label, idempotencyKey },
        "organizer",
      );
      return { applied: "option_added", reply: null };
    }

    case "extend_deadline": {
      const deadlineAt = String(args.deadlineAt ?? "");
      if (!deadlineAt) return { applied: null, reply: null };
      await extendDeadline(event, user, deadlineAt, { idempotencyKey });
      return { applied: "deadline_extended", reply: null };
    }

    case "post_note": {
      const body = String(args.body ?? "").trim();
      if (!body) {
        return {
          applied: null,
          reply: "Tell me what you'd like the note to say and I'll add it.",
        };
      }
      const audience = String(args.audience ?? "everyone");
      const visibility: NoteVisibility = isNoteVisibility(audience)
        ? audience
        : "everyone";
      const { note, notice } = await publishNote({
        event,
        user,
        participant,
        input: {
          body,
          visibility,
          optionId: args.optionId ? String(args.optionId) : null,
          source: "chat",
          idempotencyKey,
        },
      });
      return {
        applied:
          note.visibility === "everyone" ? "note_shared" : "note_to_organizer",
        reply: null,
        notice,
      };
    }

    case "retract_note": {
      const noteId = String(args.noteId ?? "");
      if (!noteId) return { applied: null, reply: null };
      await retractNoteAndRefresh({ event, user, noteId });
      return { applied: "note_retracted", reply: null };
    }

    case "remove_note": {
      const noteId = String(args.noteId ?? "");
      if (!noteId) return { applied: null, reply: null };
      await removeNoteAndRefresh({ event, user, noteId, idempotencyKey });
      return { applied: "note_removed", reply: null };
    }

    case "ask_organizer": {
      const question = String(args.question ?? "").slice(0, 600);
      if (!question) return { applied: null, reply: null };
      // A question is a note only the organizer can read. Before this it was
      // an activity row plus an email, which meant the person asking had no
      // way to see that it had gone anywhere.
      await publishNote({
        event,
        user,
        participant,
        input: {
          body: question,
          visibility: "organizer",
          source: "chat",
          idempotencyKey,
        },
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
  idempotencyKey?: string | null;
  /** Deterministic provider injection for database integration tests. */
  provider?: LlmProvider;
}): Promise<TurnResult> {
  const { event, user, role } = opts;
  const db = getDb();

  if (!event.allowChat) {
    throw new AgentApiError(403, "Chat is turned off for this event.");
  }
  if (!opts.provider && !hostedAgentAvailable()) {
    throw new AgentApiError(
      503,
      "The assistant is unavailable right now. You can still tap your answer above.",
    );
  }

  let participant = opts.participant;
  const humanMessageKey = opts.idempotencyKey
    ? `${opts.idempotencyKey}:human`
    : null;
  const agentMessageKey = opts.idempotencyKey
    ? `${opts.idempotencyKey}:agent`
    : null;
  if (agentMessageKey) {
    const [completed] = await db
      .select()
      .from(eventMessages)
      .where(
        and(
          eq(eventMessages.eventId, event.id),
          eq(eventMessages.idempotencyKey, agentMessageKey),
        ),
      )
      .limit(1);
    if (completed) {
      await countParticipantTurnOnce(completed.id, participant?.id ?? null);
      if (participant) {
        const [fresh] = await db
          .select()
          .from(eventParticipants)
          .where(eq(eventParticipants.id, participant.id))
          .limit(1);
        participant = fresh ?? participant;
      }
      return {
        reply: completed.text,
        board: await boardFor(event.id, user),
        applied: [],
        turnsRemaining:
          role === "participant"
            ? Math.max(0, chatTurnCap() - (participant?.chatTurnsUsed ?? 0))
            : Number.POSITIVE_INFINITY,
        telemetry:
          completed.provider && completed.model
            ? {
                provider: completed.provider,
                model: completed.model,
                inputTokens: completed.tokensIn,
                outputTokens: completed.tokensOut,
              }
            : undefined,
      };
    }
  }

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
        idempotencyKey: opts.idempotencyKey
          ? `${opts.idempotencyKey}:blocked`
          : null,
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

  const history = (await threadHistory(event.id, participant?.id ?? null)).filter(
    (row) => !humanMessageKey || row.idempotencyKey !== humanMessageKey,
  );
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
    idempotencyKey: humanMessageKey,
  });

  let result;
  try {
    result = await (opts.provider ?? getLlmProvider()).complete({
      system,
      messages,
      tools,
      maxOutputTokens: 400,
      budget: { userId: user.id },
    });
  } catch (error) {
    console.error("[events] chat turn failed", error);
    throw new AgentApiError(
      503,
      "The assistant could not respond. Your tapped answers are still saved.",
    );
  }

  const applied: string[] = [];
  const notices: string[] = [];
  let reply: string | null = null;
  for (const [index, call] of result.toolCalls.entries()) {
    try {
      const outcome = await applyToolCall({
        call,
        role,
        event,
        user,
        participant,
        idempotencyKey: opts.idempotencyKey
          ? `${opts.idempotencyKey}:tool:${index}`
          : undefined,
      });
      if (outcome.applied) applied.push(outcome.applied);
      if (outcome.reply) reply = outcome.reply;
      if (outcome.notice) notices.push(outcome.notice);
    } catch (error) {
      // A rejected write is normal (closed event, bad id): tell the person
      // rather than failing the turn.
      reply =
        reply ??
        (error instanceof AgentApiError
          ? error.message
          : "I couldn't save that. Try tapping your answer above.");
    }
  }

  // The refusal message is for blocked input only. A turn that ends with tool
  // calls and no prose gets an honest confirmation instead.
  if (!reply) {
    const freshSummary = (await boardFor(event.id, user)).summary;
    reply =
      boundReply(result.text) ??
      composeFallbackReply(applied, role, freshSummary);
  }

  // A downgraded note is a promise the model may have made and the board
  // could not keep, so the person is told even when the model wrote its own
  // confident reply over the top of it.
  reply = appendNotices(reply, notices);

  const agentMessage = await persistMessage({
    eventId: event.id,
    participantId: participant?.id ?? null,
    role: "agent",
    text: reply,
    toolCalls: result.toolCalls as unknown[],
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    provider: result.provider,
    model: result.model,
    idempotencyKey: agentMessageKey,
  });

  if (role === "participant" && participant) {
    await countParticipantTurnOnce(agentMessage.id, participant.id);
    const [updated] = await db
      .select()
      .from(eventParticipants)
      .where(eq(eventParticipants.id, participant.id))
      .limit(1);
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
    telemetry: {
      provider: result.provider,
      model: result.model,
      inputTokens: result.tokensIn,
      outputTokens: result.tokensOut,
    },
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
