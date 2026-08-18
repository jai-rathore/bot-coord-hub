/**
 * Agent-facing events API. Every function takes an authenticated agent and
 * enforces its scope before touching anything.
 *
 * Irreversible actions (lock, cancel) are deliberately absent: they stay the
 * human's own buttons, matching how approvals:write is excluded from default
 * agent scopes.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { events } from "@/db/schema";
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
  listEventsForUser,
  type CreateEventInput,
} from "@/lib/events/service";
import { enqueueEventNotification } from "@/lib/events/notify";

function assertEnabled(): void {
  if (!eventsFeatureEnabled()) {
    throw new AgentApiError(404, "Events are not enabled on this deployment.");
  }
}

async function ownedEvent(auth: AgentAuth, eventId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!row) throw new AgentApiError(404, "That event does not exist.");
  return row;
}

export async function agentListEvents(auth: AgentAuth) {
  assertEnabled();
  assertAgentScope(auth, "events:read");
  const { organized, joined } = await listEventsForUser(auth.user);
  const shape = (event: (typeof organized)[number]) => ({
    id: event.id,
    title: event.title,
    status: event.status,
    shareSlug: event.shareSlug,
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
  eventId: string,
  baseUrl?: string,
) {
  assertEnabled();
  assertAgentScope(auth, "events:read");
  if (!eventId) throw new AgentApiError(400, "eventId is required");

  const source = await loadBoardSource(eventId);
  if (!source) throw new AgentApiError(404, "That event does not exist.");
  const board = projectBoard(source, auth.user.id);

  return {
    ok: true,
    /** Same plain-English line the UI shows, so an agent can relay it verbatim. */
    summary: board.summary,
    shareUrl: baseUrl ? `${baseUrl}/e/${board.event.shareSlug}` : undefined,
    board,
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

export async function agentAddEventOption(
  auth: AgentAuth,
  body: {
    eventId?: string;
    dimensionId?: string;
    startsAt?: string;
    endsAt?: string | null;
    label?: string;
  },
) {
  assertEnabled();
  assertAgentScope(auth, "events:write");
  const event = await ownedEvent(auth, String(body.eventId ?? ""));
  assertOrganizer(event, auth.user);
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
  body: { eventId?: string; deadlineAt?: string },
) {
  assertEnabled();
  assertAgentScope(auth, "events:write");
  const event = await ownedEvent(auth, String(body.eventId ?? ""));
  if (!body.deadlineAt) throw new AgentApiError(400, "deadlineAt is required");
  await extendDeadline(event, auth.user, body.deadlineAt);
  return { ok: true };
}

export async function agentNudgeEventParticipants(
  auth: AgentAuth,
  body: { eventId?: string },
) {
  assertEnabled();
  assertAgentScope(auth, "events:write");
  const event = await ownedEvent(auth, String(body.eventId ?? ""));
  assertOrganizer(event, auth.user);
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
