/**
 * Event notes: the shared layer chat never had.
 *
 * Until now every word a person gave Sage died in their own private thread.
 * A note is free text that leaves that thread: it lands on the event, it is
 * visible to the other people on the event, and it survives the conversation
 * that produced it. Sage writes them through `post_note`; a person writes the
 * same rows through the composer on the event page. Same table, same rules.
 *
 * Two invariants hold everywhere in this file:
 *
 *  1. A note belongs to exactly one event. Every query filters on `eventId`,
 *     and no caller ever passes an event id that came from the model.
 *  2. `visibility` is the entire disclosure contract. There is no third state
 *     and no person-to-person channel: a note is either on the board for
 *     everyone who can see the event, or it is for the organizer alone.
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  eventNotes,
  eventOptions,
  users,
  type Event,
  type EventNote,
  type EventParticipant,
  type User,
} from "@/db/schema";
import { AgentApiError } from "@/lib/agent-errors";
import { boundedText } from "@/lib/validation";
import { displayName, formatSlot } from "@/lib/events/copy";
import type {
  EventVisibility,
  NoteSource,
  NoteView,
  NoteVisibility,
  ViewerRole,
} from "@/lib/events/types";

export type { NoteSource, NoteView, NoteVisibility };

export const NOTE_LIMITS = {
  /** Long enough for a real reason, short enough to stay a note. */
  bodyLength: 500,
  /** Per person, per event. Stops a chat loop from filling the board. */
  perAuthor: 12,
  /** How many the board carries. The feed is a digest, not an archive. */
  feedLimit: 50,
} as const;

export function isNoteVisibility(value: unknown): value is NoteVisibility {
  return value === "everyone" || value === "organizer";
}

/**
 * What a requested visibility actually becomes on this board.
 *
 * On a counts_only or blind event the organizer has said that who-answered-what
 * is private. A note signed with a name would walk straight around that: "I
 * can't do Friday" is a vote in prose. So on any board that is not `open`, a
 * note meant for everyone is kept for the organizer instead. The caller is
 * told, in `noteVisibilityNotice`, before it is saved.
 */
export function effectiveNoteVisibility(
  requested: NoteVisibility,
  eventVisibility: EventVisibility,
): NoteVisibility {
  if (requested === "organizer") return "organizer";
  return eventVisibility === "open" ? "everyone" : "organizer";
}

/** The honest sentence to show when the board downgraded what was asked for. */
export function noteVisibilityNotice(
  requested: NoteVisibility,
  effective: NoteVisibility,
): string | null {
  if (requested === effective) return null;
  return "This organizer keeps responses private, so your note goes to them rather than onto the board for everyone.";
}

/**
 * Whether one note reaches one viewer.
 *
 * Anonymous visitors never see notes. A share link is unlisted rather than
 * secret, and other people's words are not something to hand to anyone who
 * forwards the URL: tallies are public on an open board, prose is not.
 *
 * Being signed in is the bar, not having joined. Someone who opened the invite
 * and has not answered yet is exactly who the notes are for: the reason
 * Friday is out is what they need in order to answer at all: and reading one
 * tap earlier changes nothing, since answering or chatting joins them anyway.
 */
export function canSeeNote(
  note: { visibility: NoteVisibility; authorUserId: string | null },
  viewer: { role: ViewerRole; userId: string | null },
): boolean {
  if (!viewer.userId) return false;
  if (note.visibility === "everyone") return true;
  // Organizer-only: the organizer, and the person who wrote it.
  return viewer.role === "organizer" || note.authorUserId === viewer.userId;
}

/** A label for the option a note hangs off, so the feed can say what it is about. */
export function optionLabelFor(
  option: { label: string | null; startsAt: Date | null; endsAt: Date | null } | undefined,
  timezone: string,
): string | null {
  if (!option) return null;
  if (option.label) return option.label;
  if (option.startsAt) return formatSlot(option.startsAt, option.endsAt, timezone);
  return null;
}

export type NoteRow = EventNote & { authorName: string | null; authorEmail: string | null };

/**
 * Project the raw rows down to what this viewer may see. Ordering is oldest
 * first, matching the activity log, and the caller slices the tail.
 */
export function projectNotes(
  rows: NoteRow[],
  viewer: { role: ViewerRole; userId: string | null },
  opts: {
    organizerUserId: string;
    timezone: string;
    optionsById: Map<
      string,
      { label: string | null; startsAt: Date | null; endsAt: Date | null }
    >;
  },
): NoteView[] {
  return rows
    .filter((row) => row.status === "active")
    .filter((row) =>
      canSeeNote(
        {
          visibility: row.visibility as NoteVisibility,
          authorUserId: row.authorUserId,
        },
        viewer,
      ),
    )
    .map((row) => {
      const isMine = Boolean(row.authorUserId && row.authorUserId === viewer.userId);
      return {
        id: row.id,
        body: row.body,
        visibility: row.visibility as NoteVisibility,
        source: row.source as NoteSource,
        optionId: row.optionId,
        optionLabel: row.optionId
          ? optionLabelFor(opts.optionsById.get(row.optionId), opts.timezone)
          : null,
        authorName: displayName(row.authorName, row.authorEmail),
        isMine,
        isOrganizerAuthor: row.authorUserId === opts.organizerUserId,
        createdAt: row.createdAt.toISOString(),
        canRetract: isMine,
        canRemove: viewer.role === "organizer",
      };
    });
}

/**
 * The rollup shown above the feed when Sage's digest is missing: no model
 * key, a failed call, or notes that changed a moment ago. Deterministic, so
 * the board always has something true to say.
 */
export function summarizeNotesDeterministic(notes: NoteView[]): string | null {
  const shared = notes.filter((note) => note.visibility === "everyone");
  if (shared.length === 0) return null;

  const authors = new Set(shared.map((note) => note.authorName));
  const people =
    authors.size === 1 ? "1 person" : `${authors.size} people`;
  const aboutOption = shared.filter((note) => note.optionLabel).length;
  const tail =
    aboutOption > 0
      ? ` · ${aboutOption} about a specific option`
      : "";
  return `${people} added context${tail}.`;
}

/** Ids of the everyone-visible notes, in order: the digest's cache key input. */
export function sharedNoteIds(rows: Pick<EventNote, "id" | "visibility" | "status">[]): string[] {
  return rows
    .filter((row) => row.status === "active" && row.visibility === "everyone")
    .map((row) => row.id);
}

/** Load every note on one event, newest last, with author names joined. */
export async function loadEventNotes(eventId: string): Promise<NoteRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      note: eventNotes,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(eventNotes)
    .leftJoin(users, eq(eventNotes.authorUserId, users.id))
    .where(eq(eventNotes.eventId, eventId))
    .orderBy(asc(eventNotes.createdAt))
    .limit(200);

  return rows.map((row) => ({
    ...row.note,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
  }));
}

export type PostNoteInput = {
  body: string;
  visibility?: NoteVisibility;
  optionId?: string | null;
  source?: NoteSource;
  idempotencyKey?: string | null;
};

export type PostNoteResult = {
  note: EventNote;
  /** Non-null when the board downgraded the requested visibility. */
  notice: string | null;
};

/**
 * Write one note. Callable by a participant or the organizer, from chat or
 * from the composer: the caller's real role is resolved by the route, never
 * by the model.
 */
export async function postNote(opts: {
  event: Event;
  user: User;
  participant: EventParticipant | null;
  input: PostNoteInput;
}): Promise<PostNoteResult> {
  const { event, user, participant, input } = opts;
  const db = getDb();

  if (input.idempotencyKey) {
    const [replayed] = await db
      .select()
      .from(eventNotes)
      .where(
        and(
          eq(eventNotes.eventId, event.id),
          eq(eventNotes.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (replayed) {
      const requested = input.visibility ?? "everyone";
      return {
        note: replayed,
        notice: noteVisibilityNotice(requested, replayed.visibility as NoteVisibility),
      };
    }
  }

  if (event.status === "cancelled") {
    throw new AgentApiError(409, "This event was cancelled.");
  }

  const body = boundedText(input.body, "note", NOTE_LIMITS.bodyLength, {
    required: true,
  })!;

  const existing = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventNotes)
    .where(
      and(
        eq(eventNotes.eventId, event.id),
        eq(eventNotes.authorUserId, user.id),
        eq(eventNotes.status, "active"),
      ),
    );
  if ((existing[0]?.count ?? 0) >= NOTE_LIMITS.perAuthor) {
    throw new AgentApiError(
      429,
      `You've added ${NOTE_LIMITS.perAuthor} notes to this event already. Remove one before adding another.`,
    );
  }

  // An option id is only accepted when it belongs to this event, so a
  // hallucinated or copied id cannot attach a note to someone else's plan.
  let optionId: string | null = null;
  if (input.optionId) {
    const [option] = await db
      .select({ id: eventOptions.id })
      .from(eventOptions)
      .where(
        and(
          eq(eventOptions.id, input.optionId),
          eq(eventOptions.eventId, event.id),
        ),
      )
      .limit(1);
    optionId = option?.id ?? null;
  }

  const requested: NoteVisibility = input.visibility ?? "everyone";
  const visibility = effectiveNoteVisibility(
    requested,
    event.visibility as EventVisibility,
  );

  const [note] = await db
    .insert(eventNotes)
    .values({
      eventId: event.id,
      participantId: participant?.id ?? null,
      authorUserId: user.id,
      optionId,
      body,
      visibility,
      source: input.source ?? "chat",
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .onConflictDoNothing()
    .returning();

  if (!note && input.idempotencyKey) {
    const [replayed] = await db
      .select()
      .from(eventNotes)
      .where(
        and(
          eq(eventNotes.eventId, event.id),
          eq(eventNotes.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (replayed) {
      return {
        note: replayed,
        notice: noteVisibilityNotice(requested, replayed.visibility as NoteVisibility),
      };
    }
  }
  if (!note) throw new AgentApiError(500, "Could not save this note. Try again.");

  return { note, notice: noteVisibilityNotice(requested, visibility) };
}

/** The author takes their own note back. Soft delete: the row stays for audit. */
export async function retractNote(opts: {
  event: Event;
  user: User;
  noteId: string;
}): Promise<EventNote> {
  const { event, user, noteId } = opts;
  const db = getDb();

  const [note] = await db
    .select()
    .from(eventNotes)
    .where(and(eq(eventNotes.id, noteId), eq(eventNotes.eventId, event.id)))
    .limit(1);
  if (!note) throw new AgentApiError(404, "That note is not on this event.");
  if (note.authorUserId !== user.id) {
    throw new AgentApiError(403, "You can only take back your own notes.");
  }
  if (note.status === "removed") return note;

  const [updated] = await db
    .update(eventNotes)
    .set({ status: "removed", removedByUserId: user.id, updatedAt: new Date() })
    .where(eq(eventNotes.id, note.id))
    .returning();
  return updated ?? note;
}

/** The organizer takes anyone's note off the board. */
export async function removeNote(opts: {
  event: Event;
  user: User;
  noteId: string;
}): Promise<EventNote> {
  const { event, user, noteId } = opts;
  const db = getDb();

  if (event.organizerUserId !== user.id) {
    throw new AgentApiError(403, "Only the organizer can remove someone's note.");
  }

  const [note] = await db
    .select()
    .from(eventNotes)
    .where(and(eq(eventNotes.id, noteId), eq(eventNotes.eventId, event.id)))
    .limit(1);
  if (!note) throw new AgentApiError(404, "That note is not on this event.");
  if (note.status === "removed") return note;

  const [updated] = await db
    .update(eventNotes)
    .set({ status: "removed", removedByUserId: user.id, updatedAt: new Date() })
    .where(eq(eventNotes.id, note.id))
    .returning();
  return updated ?? note;
}
