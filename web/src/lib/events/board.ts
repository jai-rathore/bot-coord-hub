/**
 * The single source of truth for event status.
 *
 * Every surface — organizer UI, participant page, Sage's context, and the
 * agent API — reads this projection. If a second status query appears
 * anywhere else, that is the bug.
 */

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  eventActivity,
  eventDimensions,
  eventOptions,
  eventParticipants,
  eventResponses,
  events,
  users,
} from "@/db/schema";
import { resolveDimension, type ResolvableOption } from "@/lib/events/resolve";
import { displayName, formatSlot, statusSummary } from "@/lib/events/copy";
import {
  MIN_COUNT_DISCLOSURE,
  type DimensionView,
  type EventBoard,
  type EventPref,
  type OptionTally,
  type ParticipantView,
  type ViewerRole,
} from "@/lib/events/types";

export type BoardSource = {
  event: typeof events.$inferSelect;
  organizerName: string;
  dimensions: Array<typeof eventDimensions.$inferSelect>;
  options: Array<typeof eventOptions.$inferSelect>;
  participants: Array<{
    participant: typeof eventParticipants.$inferSelect;
    name: string;
  }>;
  responses: Array<typeof eventResponses.$inferSelect>;
};

/** Load everything the projection needs in one pass. */
export async function loadBoardSource(
  eventId: string,
): Promise<BoardSource | null> {
  const db = getDb();
  const [row] = await db
    .select({ event: events, organizerName: users.name, organizerEmail: users.email })
    .from(events)
    .leftJoin(users, eq(events.organizerUserId, users.id))
    .where(eq(events.id, eventId))
    .limit(1);
  if (!row) return null;

  const [dimensions, options, participantRows, responses] = await Promise.all([
    db
      .select()
      .from(eventDimensions)
      .where(eq(eventDimensions.eventId, eventId))
      .orderBy(asc(eventDimensions.position)),
    db
      .select()
      .from(eventOptions)
      .where(eq(eventOptions.eventId, eventId))
      .orderBy(asc(eventOptions.position)),
    db
      .select({ participant: eventParticipants, name: users.name, email: users.email })
      .from(eventParticipants)
      .leftJoin(users, eq(eventParticipants.userId, users.id))
      .where(eq(eventParticipants.eventId, eventId))
      .orderBy(asc(eventParticipants.joinedAt)),
    db.select().from(eventResponses).where(eq(eventResponses.eventId, eventId)),
  ]);

  return {
    event: row.event,
    organizerName: displayName(
      row.organizerName,
      row.organizerEmail,
      "The organizer",
    ),
    dimensions,
    options,
    participants: participantRows.map((p) => ({
      participant: p.participant,
      name: displayName(p.name, p.email),
    })),
    responses,
  };
}

export async function findEventBySlug(slug: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(events)
    .where(eq(events.shareSlug, slug))
    .limit(1);
  return row ?? null;
}

export async function findParticipant(eventId: string, userId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(eventParticipants)
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Pure projection. Visibility is enforced here and nowhere else, so a client
 * can never receive data it is not permitted to see.
 */
export function projectBoard(
  source: BoardSource,
  viewerUserId: string | null,
  now = new Date(),
): EventBoard {
  const { event } = source;

  const viewerParticipant =
    viewerUserId != null
      ? source.participants.find((p) => p.participant.userId === viewerUserId)
      : undefined;
  const isOrganizer =
    viewerUserId != null && viewerUserId === event.organizerUserId;

  const role: ViewerRole = isOrganizer
    ? "organizer"
    : viewerParticipant
      ? "participant"
      : "public";

  const respondedParticipantIds = new Set(
    source.responses.map((r) => r.participantId),
  );
  const respondedCount = source.participants.filter(
    (p) =>
      respondedParticipantIds.has(p.participant.id) ||
      p.participant.attendance !== "pending",
  ).length;
  const joinedCount = source.participants.length;

  // ---- disclosure ------------------------------------------------------
  const visibility = event.visibility;
  const showNames = isOrganizer || visibility === "open";
  const countsSuppressed =
    !isOrganizer &&
    (visibility === "blind" ||
      (visibility === "counts_only" && respondedCount < MIN_COUNT_DISCLOSURE));
  const showCounts = isOrganizer || !countsSuppressed;

  // ---- per-option tallies ---------------------------------------------
  const participantById = new Map(
    source.participants.map((p) => [p.participant.id, p] as const),
  );
  const responsesByOption = new Map<string, typeof source.responses>();
  for (const response of source.responses) {
    const list = responsesByOption.get(response.optionId) ?? [];
    list.push(response);
    responsesByOption.set(response.optionId, list);
  }

  const myResponses = new Map<string, EventPref>();
  if (viewerParticipant) {
    for (const response of source.responses) {
      if (response.participantId === viewerParticipant.participant.id) {
        myResponses.set(response.optionId, response.value as EventPref);
      }
    }
  }

  const organizerParticipant = source.participants.find(
    (p) => p.participant.userId === event.organizerUserId,
  );

  const dimensions: DimensionView[] = source.dimensions.map((dimension) => {
    const dimensionOptions = source.options.filter(
      (o) => o.dimensionId === dimension.id,
    );

    const options: OptionTally[] = dimensionOptions.map((option) => {
      const votes = responsesByOption.get(option.id) ?? [];
      const yes = votes.filter((v) => v.value === "yes").length;
      const maybe = votes.filter((v) => v.value === "maybe").length;
      const no = votes.filter((v) => v.value === "no").length;
      return {
        id: option.id,
        dimensionId: option.dimensionId,
        label:
          option.label ??
          (option.startsAt
            ? formatSlot(option.startsAt, option.endsAt, event.timezone)
            : null),
        startsAt: option.startsAt?.toISOString() ?? null,
        endsAt: option.endsAt?.toISOString() ?? null,
        capacity: option.capacity,
        position: option.position,
        status: option.status,
        createdByRole: option.createdByRole,
        yes: showCounts ? yes : null,
        maybe: showCounts ? maybe : null,
        no: showCounts ? no : null,
        score: showCounts ? yes + maybe * 0.5 : null,
        voters: showNames
          ? votes
              .map((v) => ({
                participantId: v.participantId,
                name: participantById.get(v.participantId)?.name ?? "Someone",
                value: v.value as EventPref,
              }))
              .sort((a, b) => a.name.localeCompare(b.name))
          : null,
        mine: myResponses.get(option.id) ?? null,
        atCapacity: option.capacity != null && yes > option.capacity,
      };
    });

    return {
      id: dimension.id,
      kind: dimension.kind,
      label: dimension.label,
      mode: dimension.mode,
      position: dimension.position,
      resolvedOptionId: dimension.resolvedOptionId,
      options,
    };
  });

  // ---- leader (computed from full data, disclosed per visibility) -------
  const decidable = source.dimensions.find(
    (d) => d.mode === "open" && d.kind !== "attendance",
  );
  let leader: EventBoard["leader"] = null;
  let quorumMet = false;
  let leadingYes = 0;
  let leadingLabel: string | null = null;

  if (decidable) {
    const resolvable: ResolvableOption[] = source.options
      .filter((o) => o.dimensionId === decidable.id)
      .map((o) => ({
        id: o.id,
        position: o.position,
        status: o.status,
        capacity: o.capacity,
        startsAt: o.startsAt,
        organizerPref: organizerParticipant
          ? (source.responses.find(
              (r) =>
                r.optionId === o.id &&
                r.participantId === organizerParticipant.participant.id,
            )?.value as EventPref | undefined) ?? null
          : null,
      }));
    const votes = source.responses
      .filter((r) => r.dimensionId === decidable.id)
      .map((r) => ({ optionId: r.optionId, value: r.value as EventPref }));

    const outcome = resolveDimension(resolvable, votes, event.quorumMin);
    quorumMet = outcome.quorumMet;
    if (outcome.winner) {
      leadingYes = outcome.winner.yes;
      const view = dimensions
        .find((d) => d.id === decidable.id)
        ?.options.find((o) => o.id === outcome.winner!.optionId);
      leadingLabel = view?.label ?? null;
      leader = {
        dimensionId: decidable.id,
        optionId: outcome.winner.optionId,
        score: outcome.winner.score,
        yes: outcome.winner.yes,
      };
    }
  }

  const participants: ParticipantView[] | null = showNames
    ? source.participants.map((p) => ({
        id: p.participant.id,
        userId: p.participant.userId,
        name: p.name,
        role: p.participant.role,
        attendance: p.participant.attendance,
        respondedAt: p.participant.respondedAt?.toISOString() ?? null,
        isOrganizer: p.participant.userId === event.organizerUserId,
      }))
    : null;

  // Any signed-in viewer can respond, participant or not: the respond
  // endpoints join-imply, and a share link is exactly the case where someone
  // signed in a moment ago and has not joined yet. Gating this on role left
  // every fresh recipient staring at disabled buttons.
  const canRespond =
    viewerUserId != null &&
    event.status === "open" &&
    event.deadlineAt.getTime() > now.getTime();

  return {
    event: {
      id: event.id,
      publicId: event.publicId,
      shareSlug: event.shareSlug,
      title: event.title,
      description: event.description,
      timezone: event.timezone,
      status: event.status,
      visibility: event.visibility,
      lockPolicy: event.lockPolicy,
      quorumMin: event.quorumMin,
      capacityMax: event.capacityMax,
      deadlineAt: event.deadlineAt.toISOString(),
      lockedAt: event.lockedAt?.toISOString() ?? null,
      confirmedAt: event.confirmedAt?.toISOString() ?? null,
      agentMode: event.agentMode,
      agentName: event.agentName,
      allowChat: event.allowChat,
      allowGuestOptions: event.allowGuestOptions,
      organizerName: source.organizerName,
      createdAt: event.createdAt.toISOString(),
    },
    viewer: {
      role,
      participantId: viewerParticipant?.participant.id ?? null,
      attendance: viewerParticipant?.participant.attendance ?? null,
      hasResponded: viewerParticipant
        ? respondedParticipantIds.has(viewerParticipant.participant.id) ||
          viewerParticipant.participant.attendance !== "pending"
        : false,
      canRespond,
      notifyUpdates: viewerParticipant
        ? viewerParticipant.participant.notifyUpdates
        : null,
      notifyChannel: "email",
      hasPhone: false,
    },
    dimensions,
    participants,
    counts: {
      joined: showCounts ? joinedCount : null,
      responded: showCounts ? respondedCount : null,
      pending: showCounts ? joinedCount - respondedCount : null,
    },
    leader: showCounts ? leader : null,
    quorum: {
      // `required` is a rule of the event, so everyone may see it. Progress
      // toward it is an aggregate and follows the same disclosure rules as
      // counts and voters — otherwise a blind event leaks its own tally.
      required: event.quorumMin,
      met: showCounts ? quorumMet : null,
      leadingYes: showCounts ? leadingYes : null,
    },
    summary: statusSummary({
      status: event.status,
      responded: showCounts ? respondedCount : null,
      joined: showCounts ? joinedCount : null,
      leadingLabel: showCounts ? leadingLabel : null,
      deadlineAt: event.deadlineAt,
      quorumRequired: event.quorumMin,
      quorumMet,
      countsHidden: !showCounts,
      now,
    }),
    countsSuppressed,
  };
}

/** Recent activity, organizer-only. */
export async function loadEventActivity(eventId: string, limit = 40) {
  const db = getDb();
  return db
    .select()
    .from(eventActivity)
    .where(eq(eventActivity.eventId, eventId))
    .orderBy(asc(eventActivity.createdAt))
    .limit(limit);
}
