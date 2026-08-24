/**
 * Agent-facing events API. Every function takes an authenticated agent and
 * enforces its scope before touching anything.
 *
 * An agent can do both halves of an event: organize one, and take part in
 * someone else's. The participant half is what a human is handed in practice :
 * a share link: so every entry point here resolves an event by id, share slug,
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
import { isNoteVisibility, NOTE_LIMITS } from "@/lib/events/notes";
import {
  addOption,
  archiveEvent,
  assertOrganizer,
  createEvent,
  extendDeadline,
  joinEvent,
  listEventsForUser,
  publishNote,
  removeNoteAndRefresh,
  retractNoteAndRefresh,
  setNotifyUpdates,
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

export async function agentListEvents(
  auth: AgentAuth,
  baseUrl?: string,
  opts: { archived?: unknown; limit?: unknown; offset?: unknown } = {},
) {
  assertEnabled();
  assertAgentScope(auth, "events:read");
  const archived = opts.archived === true;
  const limit =
    typeof opts.limit === "number" && Number.isFinite(opts.limit)
      ? Math.min(Math.max(Math.trunc(opts.limit), 1), 100)
      : undefined;
  const offset =
    typeof opts.offset === "number" && Number.isFinite(opts.offset)
      ? Math.max(Math.trunc(opts.offset), 0)
      : undefined;
  const { organized, joined, hasMore } = await listEventsForUser(auth.user, {
    archived,
    limit,
    offset,
  });
  const shape = (event: (typeof organized)[number]) => ({
    id: event.id,
    title: event.title,
    status: event.status,
    timezone: event.timezone,
    visibility: event.visibility,
    shareSlug: event.shareSlug,
    shareUrl: baseUrl ? `${baseUrl}/e/${event.shareSlug}` : undefined,
    deadlineAt: event.deadlineAt.toISOString(),
    quorumMin: event.quorumMin,
  });
  return {
    ok: true,
    archived,
    hasMore,
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
 * same call: and a key holding events:write but not events:read still works.
 */
async function boardPayload(auth: AgentAuth, event: Event, baseUrl?: string) {
  const source = await loadBoardSource(event.id);
  if (!source) throw new AgentApiError(404, "That event does not exist.");

  // Projected for this agent's human: a non-participant gets the same public
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
      ? board.viewer.participantId
        ? "Ask your human which of these work, then call respond_to_event with the optionIds above. Do not guess for them. When they give a reason the others should know: why a day is out, what they need: also call post_event_note; board.notes is where those live."
        : "Your human is not on this event yet. Ask them which times work, then call respond_to_event: it joins them at the same time. Read board.notes first: someone may already have said why a time does not work."
      : "This event is closed to new responses. Relay the summary and board.notes; do not try to answer.",
  };
}

export async function agentCreateEvent(
  auth: AgentAuth,
  body: Record<string, unknown>,
  baseUrl?: string,
) {
  assertEnabled();
  assertAgentScope(auth, "events:write");
  const event = await createEvent(
    auth.user,
    body as unknown as CreateEventInput,
    { kind: "agent", apiKeyId: auth.apiKey.id },
  );
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
 * Join on the human's behalf. Idempotent: an agent that re-runs its turn, or
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
      "dimensionId is required: take it from get_event_board.",
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

/**
 * Leave a note on the event, on the human's behalf.
 *
 * The same write Sage makes through its `post_note` tool and the same one the
 * composer on the event page makes: one code path, so an agent cannot reach
 * past a rule the other two obey. In particular `publishNote` still downgrades
 * an `everyone` note to the organizer on a private board, and still returns
 * the notice saying so; that notice is handed back here rather than swallowed,
 * because an agent that told its human "everyone can see it" would be lying.
 */
export async function agentPostEventNote(
  auth: AgentAuth,
  body: {
    eventId?: unknown;
    shareSlug?: unknown;
    shareUrl?: unknown;
    body?: unknown;
    audience?: unknown;
    optionId?: unknown;
  },
) {
  assertEnabled();
  assertAgentScope(auth, "events:write");
  const event = await resolveEventRef(eventRefFrom(body));

  if (typeof body.body !== "string" || !body.body.trim()) {
    throw new AgentApiError(400, "body is required: the note, in their words.");
  }

  const audience = typeof body.audience === "string" ? body.audience : "everyone";
  if (!isNoteVisibility(audience)) {
    throw new AgentApiError(
      400,
      "audience must be 'everyone' or 'organizer'.",
    );
  }

  // Leaving a note is engaging with the event, exactly as responding is, so
  // it joins first rather than making the agent call join_event separately.
  const db = getDb();
  const [existing] = await db
    .select()
    .from(eventParticipants)
    .where(
      and(
        eq(eventParticipants.eventId, event.id),
        eq(eventParticipants.userId, auth.user.id),
      ),
    )
    .limit(1);
  const isOrganizer = event.organizerUserId === auth.user.id;
  const participant =
    existing ?? (isOrganizer ? null : await joinEvent(event, auth.user));

  const { note, notice } = await publishNote({
    event,
    user: auth.user,
    participant,
    input: {
      body: body.body,
      visibility: audience,
      optionId: typeof body.optionId === "string" ? body.optionId : null,
      source: "chat",
    },
  });

  return {
    ok: true,
    noteId: note.id,
    /** What it actually became, which is not always what was asked for. */
    audience: note.visibility,
    notice,
    human_note:
      note.visibility === "everyone"
        ? "This is on the event board for everyone who can see the event."
        : "Only the organizer can read this one.",
    agent_instructions:
      notice ??
      "Relay the note back to your human as recorded. Do not post the same note twice.",
  };
}

/**
 * Take a note down. The author retracts their own; the organizer removes
 * anyone's. Which applies is decided from the caller's real role here, never
 * from the request: an agent naming someone else's note gets the author
 * check, and fails it.
 */
export async function agentRetractEventNote(
  auth: AgentAuth,
  body: {
    eventId?: unknown;
    shareSlug?: unknown;
    shareUrl?: unknown;
    noteId?: unknown;
  },
) {
  assertEnabled();
  assertAgentScope(auth, "events:write");
  const event = await resolveEventRef(eventRefFrom(body));
  if (typeof body.noteId !== "string" || !body.noteId) {
    throw new AgentApiError(
      400,
      "noteId is required: take it from get_event_board.",
    );
  }

  const asOrganizer = event.organizerUserId === auth.user.id;
  if (asOrganizer) {
    await removeNoteAndRefresh({ event, user: auth.user, noteId: body.noteId });
  } else {
    await retractNoteAndRefresh({ event, user: auth.user, noteId: body.noteId });
  }
  return {
    ok: true,
    removedAs: asOrganizer ? "organizer" : "author",
    noteLimit: NOTE_LIMITS.perAuthor,
  };
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

/**
 * Hide or restore an event on this human's list. Per-person and reversible :
 * the same button the Events page offers: so an agent can clean up without
 * cancelling for everyone else.
 */
export async function agentArchiveEvent(
  auth: AgentAuth,
  body: {
    eventId?: unknown;
    shareSlug?: unknown;
    shareUrl?: unknown;
    archived?: unknown;
  },
) {
  assertEnabled();
  assertAgentScope(auth, "events:write");
  const event = await resolveEventRef(eventRefFrom(body));
  const archived = body.archived !== false;
  await archiveEvent(event, auth.user, archived);
  return {
    ok: true,
    eventId: event.id,
    archived,
    human_note: archived
      ? "This event is off your list. It is still on everyone else's. Call list_events with archived=true to find it again."
      : "This event is back on your list.",
  };
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
 * Opt this agent's human in or out of updates on an event: someone answered,
 * a new time was suggested. Delivered to their email (when configured) and to
 * this same agent's inbox, off one dedupe key. Joins the event if needed.
 */
export async function agentSetEventNotifications(
  auth: AgentAuth,
  body: {
    eventId?: unknown;
    shareSlug?: unknown;
    shareUrl?: unknown;
    notify?: unknown;
  },
) {
  assertEnabled();
  assertAgentScope(auth, "events:write");
  const event = await resolveEventRef(eventRefFrom(body));
  const notify = body.notify !== false;
  const participant = await setNotifyUpdates(event, auth.user, notify);
  return {
    ok: true,
    eventId: event.id,
    notify: participant.notifyUpdates,
    human_note: notify
      ? "Updates about this event will arrive in your inbox (get_inbox) and by the channel your human chose in Settings: email, text, or both."
      : "Updates for this event are off.",
  };
}

/**
 * "My human met someone at a conference and has their handle."
 *
 * The same thing the QR does, for the case where an agent is told about the
 * encounter instead of a camera being pointed at a screen. The connection stays
 * approval-gated either way: an agent cannot link two people by asserting they
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
