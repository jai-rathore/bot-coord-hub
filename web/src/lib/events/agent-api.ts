/**
 * Agent-facing events API. Every function takes an authenticated agent and
 * enforces its scope before touching anything.
 *
 * An agent can do both halves of an event: organize one, and take part in
 * someone else's. The participant half is what a human is handed in practice —
 * a share link — so every entry point here resolves an event by id, share slug,
 * or a pasted share URL.
 *
 * Irreversible actions (lock, cancel, confirm/book) are deliberately absent:
 * they stay the human's own buttons, matching how approvals:write is excluded
 * from default agent scopes.
 */

import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { eventParticipants, events, type Event } from "@/db/schema";
import type { AgentAuth } from "@/lib/agent-auth";
import { AgentApiError } from "@/lib/agent-errors";
import { assertAgentScope } from "@/lib/scopes";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import { loadBoardSource, projectBoard } from "@/lib/events/board";
import {
  addOption,
  assertOrganizer,
  createEvent,
  extendDeadline,
  joinEvent,
  listEventsForUser,
  setResponses,
  type CreateEventInput,
  type ResponseEntry,
} from "@/lib/events/service";
import { enqueueEventNotification } from "@/lib/events/notify";
import type { EventPref } from "@/lib/events/types";
import { isMeetChoice, recordMeeting } from "@/lib/meet";

function assertEnabled(): void {
  if (!eventsFeatureEnabled()) {
    throw new AgentApiError(404, "Events are not enabled on this deployment.");
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve whatever an agent was handed.
 *
 * A human pastes their agent a share link, not a UUID, so all three forms
 * resolve here: an event id, a bare share slug, or a full `/e/<slug>` URL from
 * any host. Share slugs are base64url and never uuid-shaped, so the two cannot
 * collide.
 */
export async function resolveEventRef(ref: unknown): Promise<Event> {
  const raw = typeof ref === "string" ? ref.trim() : "";
  if (!raw) {
    throw new AgentApiError(
      400,
      "Pass the event's id, its share slug, or the share link you were given.",
    );
  }

  const fromUrl = /\/e\/([A-Za-z0-9_-]{6,64})/.exec(raw)?.[1];
  const needle = fromUrl ?? raw;

  const db = getDb();
  const [row] = await db
    .select()
    .from(events)
    .where(
      UUID_RE.test(needle)
        ? or(eq(events.id, needle), eq(events.shareSlug, needle))
        : eq(events.shareSlug, needle),
    )
    .limit(1);
  if (!row) throw new AgentApiError(404, "That event link is not valid.");
  return row;
}

/** Resolve, then require that this agent's human organizes it. */
async function organizedEvent(auth: AgentAuth, ref: unknown): Promise<Event> {
  const event = await resolveEventRef(ref);
  assertOrganizer(event, auth.user);
  return event;
}

/** The event ref an agent may have passed under any of the accepted names. */
function eventRefFrom(body: {
  eventId?: unknown;
  shareSlug?: unknown;
  shareUrl?: unknown;
}): unknown {
  return body.eventId ?? body.shareSlug ?? body.shareUrl;
}

export async function agentListEvents(auth: AgentAuth, baseUrl?: string) {
  assertEnabled();
  assertAgentScope(auth, "events:read");
  const { organized, joined } = await listEventsForUser(auth.user);
  const shape = (event: (typeof organized)[number]) => ({
    id: event.id,
    title: event.title,
    status: event.status,
    shareSlug: event.shareSlug,
    shareUrl: baseUrl ? `${baseUrl}/e/${event.shareSlug}` : undefined,
    deadlineAt: event.deadlineAt.toISOString(),
    quorumMin: event.quorumMin,
  });
  return {
    ok: true,
    organized: organized.map(shape),
    joined: joined.map(shape),
  };
}

export async function agentGetEventBoard(
  auth: AgentAuth,
  ref: unknown,
  baseUrl?: string,
) {
  assertEnabled();
  assertAgentScope(auth, "events:read");
  return boardPayload(auth, await resolveEventRef(ref), baseUrl);
}

/**
 * The board an agent sees, with no scope assertion of its own.
 *
 * Writes return it too, so an agent sees the result of what it just did in the
 * same call — and a key holding events:write but not events:read still works.
 */
async function boardPayload(auth: AgentAuth, event: Event, baseUrl?: string) {
  const source = await loadBoardSource(event.id);
  if (!source) throw new AgentApiError(404, "That event does not exist.");

  // Projected for this agent's human — a non-participant gets the same public
  // view a signed-out browser would, never the roster.
  const board = projectBoard(source, auth.user.id);

  // An agent reading a link it has not joined sees canRespond=false, which is
  // the moment it most needs telling that respond_to_event joins for it.
  const stillOpen =
    board.event.status === "open" &&
    new Date(board.event.deadlineAt).getTime() > Date.now();

  return {
    ok: true,
    eventId: event.id,
    /** Same plain-English line the UI shows, so an agent can relay it verbatim. */
    summary: board.summary,
    shareUrl: baseUrl ? `${baseUrl}/e/${board.event.shareSlug}` : undefined,
    board,
    agent_instructions: stillOpen
      ? board.viewer.canRespond
        ? "Ask your human which of these work, then call respond_to_event with the optionIds above. Do not guess for them."
        : "Your human is not on this event yet. Ask them which times work, then call respond_to_event — it joins them at the same time."
      : "This event is closed to new responses. Relay the summary; do not try to answer.",
  };
}

export async function agentCreateEvent(
  auth: AgentAuth,
  body: Record<string, unknown>,
  baseUrl?: string,
) {
  assertEnabled();
  assertAgentScope(auth, "events:write");
  const event = await createEvent(auth.user, body as unknown as CreateEventInput);
  return {
    ok: true,
    event: {
      id: event.id,
      title: event.title,
      shareSlug: event.shareSlug,
      deadlineAt: event.deadlineAt.toISOString(),
    },
    shareUrl: baseUrl ? `${baseUrl}/e/${event.shareSlug}` : undefined,
    human_note:
      "Share this link. Anyone can read it; responding requires a sign-in. You confirm before anything is booked.",
  };
}

/**
 * Join on the human's behalf. Idempotent — an agent that re-runs its turn, or
 * two agents for the same human, land on the same participant row.
 */
export async function agentJoinEvent(
  auth: AgentAuth,
  body: { eventId?: unknown; shareSlug?: unknown; shareUrl?: unknown },
  baseUrl?: string,
) {
  assertEnabled();
  assertAgentScope(auth, "events:write");
  const event = await resolveEventRef(eventRefFrom(body));
  await joinEvent(event, auth.user);
  return boardPayload(auth, event, baseUrl);
}

/**
 * Answer an event.
 *
 * This is the participant half of the product, and the reason an agent is
 * useful here at all: its human says "Tuesday works, Thursday doesn't" once and
 * the agent records it. Joining is implied, exactly as it is in the browser, so
 * a share link is a single call.
 */
export async function agentRespondToEvent(
  auth: AgentAuth,
  body: {
    eventId?: unknown;
    shareSlug?: unknown;
    shareUrl?: unknown;
    entries?: unknown;
    attendance?: unknown;
  },
  baseUrl?: string,
) {
  assertEnabled();
  assertAgentScope(auth, "events:write");
  const event = await resolveEventRef(eventRefFrom(body));

  const entries: ResponseEntry[] = Array.isArray(body.entries)
    ? body.entries.map((entry) => {
        const row = (entry ?? {}) as { optionId?: unknown; value?: unknown };
        if (typeof row.optionId !== "string" || !row.optionId) {
          throw new AgentApiError(
            400,
            "Each entry needs an optionId from get_event_board.",
          );
        }
        if (row.value !== "yes" && row.value !== "no" && row.value !== "maybe") {
          throw new AgentApiError(400, "A response must be yes, no, or maybe.");
        }
        return { optionId: row.optionId, value: row.value };
      })
    : [];

  const attendance = body.attendance;
  if (
    attendance !== undefined &&
    attendance !== "yes" &&
    attendance !== "no" &&
    attendance !== "maybe"
  ) {
    throw new AgentApiError(400, "attendance must be yes, no, or maybe.");
  }
  if (entries.length === 0 && attendance === undefined) {
    throw new AgentApiError(
      400,
      "Give entries from get_event_board, an attendance answer, or both.",
    );
  }

  // Responding implies joining, matching the one-tap browser flow.
  const participant = await joinEvent(event, auth.user);
  await setResponses(
    event,
    participant,
    entries,
    attendance as EventPref | undefined,
  );

  return boardPayload(auth, event, baseUrl);
}

/**
 * Suggest a time or place as a participant.
 *
 * Distinct from add_event_option: that one is the organizer's, this one is
 * capped per person and can be switched off by the organizer.
 */
export async function agentSuggestEventOption(
  auth: AgentAuth,
  body: {
    eventId?: unknown;
    shareSlug?: unknown;
    shareUrl?: unknown;
    dimensionId?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
    label?: unknown;
  },
) {
  assertEnabled();
  assertAgentScope(auth, "events:write");
  const event = await resolveEventRef(eventRefFrom(body));
  if (typeof body.dimensionId !== "string" || !body.dimensionId) {
    throw new AgentApiError(
      400,
      "dimensionId is required — take it from get_event_board.",
    );
  }

  const db = getDb();
  const [participant] = await db
    .select({ id: eventParticipants.id })
    .from(eventParticipants)
    .where(
      and(
        eq(eventParticipants.eventId, event.id),
        eq(eventParticipants.userId, auth.user.id),
      ),
    )
    .limit(1);
  if (!participant) {
    throw new AgentApiError(403, "Join this event before suggesting an option.");
  }

  // The organizer's own suggestions are not capped, and are labelled as theirs.
  const role =
    event.organizerUserId === auth.user.id ? "organizer" : "participant";
  await addOption(
    event,
    auth.user,
    {
      dimensionId: body.dimensionId,
      startsAt: typeof body.startsAt === "string" ? body.startsAt : undefined,
      endsAt: typeof body.endsAt === "string" ? body.endsAt : null,
      label: typeof body.label === "string" ? body.label : undefined,
    },
    role,
  );
  return { ok: true, role };
}

export async function agentAddEventOption(
  auth: AgentAuth,
  body: {
    eventId?: unknown;
    shareSlug?: unknown;
    shareUrl?: unknown;
    dimensionId?: string;
    startsAt?: string;
    endsAt?: string | null;
    label?: string;
  },
) {
  assertEnabled();
  assertAgentScope(auth, "events:write");
  const event = await organizedEvent(auth, eventRefFrom(body));
  if (!body.dimensionId) {
    throw new AgentApiError(400, "dimensionId is required");
  }
  await addOption(
    event,
    auth.user,
    {
      dimensionId: body.dimensionId,
      startsAt: body.startsAt,
      endsAt: body.endsAt ?? null,
      label: body.label,
    },
    "organizer",
  );
  return { ok: true };
}

export async function agentExtendEventDeadline(
  auth: AgentAuth,
  body: {
    eventId?: unknown;
    shareSlug?: unknown;
    shareUrl?: unknown;
    deadlineAt?: string;
  },
) {
  assertEnabled();
  assertAgentScope(auth, "events:write");
  const event = await resolveEventRef(eventRefFrom(body));
  if (!body.deadlineAt) throw new AgentApiError(400, "deadlineAt is required");
  await extendDeadline(event, auth.user, body.deadlineAt);
  return { ok: true };
}

export async function agentNudgeEventParticipants(
  auth: AgentAuth,
  body: { eventId?: unknown; shareSlug?: unknown; shareUrl?: unknown },
) {
  assertEnabled();
  assertAgentScope(auth, "events:write");
  const event = await organizedEvent(auth, eventRefFrom(body));
  const queued = await enqueueEventNotification({
    eventId: event.id,
    template: "deadline_soon",
    dedupeKey: `nudge:${event.id}:${Date.now()}`,
    payload: { title: event.title, hours: "a few" },
    toAllParticipants: true,
  });
  return { ok: true, queued };
}

/**
 * "My human met someone at a conference and has their handle."
 *
 * The same thing the QR does, for the case where an agent is told about the
 * encounter instead of a camera being pointed at a screen. The connection stays
 * approval-gated either way — an agent cannot link two people by asserting they
 * met.
 */
export async function agentRecordMeeting(
  auth: AgentAuth,
  args: Record<string, unknown>,
  baseUrl?: string,
) {
  assertAgentScope(auth, "people:write");

  const handle = typeof args.handle === "string" ? args.handle.trim() : "";
  if (!handle) throw new AgentApiError(400, "handle is required");
  if (!isMeetChoice(args.intent)) {
    throw new AgentApiError(
      400,
      "intent must be coffee, lunch, drinks, call, or connect.",
    );
  }
  // "connect" writes no event, so it must not demand the scope for one.
  if (args.intent !== "connect") {
    assertEnabled();
    assertAgentScope(auth, "events:write");
  }

  const result = await recordMeeting({
    scanner: auth.user,
    handle: handle.replace(/^@/, ""),
    intent: args.intent,
    timezone: args.timezone,
    origin: baseUrl ?? "https://honeymatcha.io",
  });

  return {
    ...result,
    agent_instructions: result.event
      ? "Give your human the event URL, or call respond_to_event once they tell you which times work. The other person approves the connection separately."
      : "The connection request is waiting on the other person's approval. Nothing else to do.",
  };
}

/**
 * Locking, cancelling, and booking are intentionally not exposed to agents.
 * Returned as a clear instruction rather than a 403 so an agent explains
 * rather than retries.
 */
export function agentHumanOnlyEventAction(action: string) {
  return {
    ok: false,
    error: `${action} is a human-only action on HoneyMatcha.`,
    agent_instructions:
      "Tell the organizer to open the event in HoneyMatcha and use the control there. Do not retry.",
  };
}
