"use client";

import { useEffect, useMemo, useState } from "react";
import type { EventBoard, NoteView } from "@/lib/events/types";

/** Matches NOTE_LIMITS.bodyLength on the server. */
const MAX_NOTE_LENGTH = 500;

function relativeTime(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

function NoteRow({
  note,
  now,
  busy,
  onRemove,
}: {
  note: NoteView;
  now: number;
  busy: boolean;
  onRemove: (noteId: string) => void;
}) {
  const canTakeDown = note.canRetract || note.canRemove;
  return (
    <li className="rounded-[0.8rem] border border-line bg-white/70 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-ink">
          {note.isMine ? "You" : note.authorName}
        </span>
        {note.isOrganizerAuthor && (
          <span className="text-[0.65rem] font-bold tracking-[0.1em] text-muted uppercase">
            host
          </span>
        )}
        {note.optionLabel && (
          <span className="rounded-full bg-matcha/10 px-2 py-0.5 text-[0.65rem] font-semibold text-matcha-deep">
            {note.optionLabel}
          </span>
        )}
        {note.visibility === "organizer" && (
          <span className="rounded-full bg-honey-soft px-2 py-0.5 text-[0.65rem] font-semibold text-matcha-deep">
            Organizer only
          </span>
        )}
        <span className="ml-auto text-xs text-muted">
          {relativeTime(note.createdAt, now)}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-6 whitespace-pre-wrap text-ink">
        {note.body}
      </p>
      {canTakeDown && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onRemove(note.id)}
          className="mt-2 text-xs font-semibold text-muted hover:text-danger"
        >
          {note.canRetract ? "Take it back" : "Remove"}
        </button>
      )}
    </li>
  );
}

/**
 * The shared layer of the event.
 *
 * Everything Sage records through `post_note` shows up here, next to notes
 * people typed themselves: same rows, same rules. The board is re-fetched by
 * the parent on a timer, so this list is whatever the event currently says
 * without anyone reloading the page.
 */
export function EventNotes({
  board,
  agentName,
  busy,
  onPost,
  onRemove,
}: {
  board: EventBoard;
  agentName: string;
  busy: boolean;
  onPost: (input: {
    body: string;
    visibility: "everyone" | "organizer";
    optionId: string | null;
  }) => Promise<string | null>;
  onRemove: (noteId: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [visibility, setVisibility] = useState<"everyone" | "organizer">(
    "everyone",
  );
  const [optionId, setOptionId] = useState<string>("");
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // One clock for the whole list, ticking on its own so "just now" becomes
  // "3m ago" without waiting for the next board poll to re-render the page.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const options = useMemo(
    () =>
      board.dimensions.flatMap((dimension) =>
        dimension.options
          .filter((option) => option.status === "active")
          .map((option) => ({
            id: option.id,
            label: option.label ?? "Option",
          })),
      ),
    [board.dimensions],
  );

  const isOrganizer = board.viewer.role === "organizer";
  const boardIsPrivate = board.event.visibility !== "open";

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    const result = await onPost({
      body,
      visibility,
      optionId: optionId || null,
    });
    setDraft("");
    setOptionId("");
    setNotice(result);
  }

  if (!board.canPostNote && board.notes.length === 0) return null;

  return (
    <section className="surface-card p-6 sm:p-7" aria-label="Notes">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">What people said</h2>
        <span className="live-dot animate-pulse-live" aria-hidden />
      </div>

      {board.notesSummary ? (
        <p className="mt-2 text-sm leading-6 font-medium text-matcha-deep">
          {board.notesSummary}
          {board.notesDigestIsLive && (
            <span className="ml-2 text-[0.65rem] font-bold tracking-[0.1em] text-muted uppercase">
              {agentName}&apos;s summary
            </span>
          )}
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Nothing yet. A note is for the things a yes or no can&apos;t carry, such
          as context, questions, or a reason a particular option does not work.
        </p>
      )}

      {board.notes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {board.notes
            .slice()
            .reverse()
            .map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                now={now}
                busy={busy}
                onRemove={onRemove}
              />
            ))}
        </ul>
      )}

      {board.canPostNote && (
        <>
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="button-secondary mt-4"
            >
              Add a note
            </button>
          ) : (
            <form onSubmit={submit} className="mt-4 grid gap-3">
              <label className="grid gap-1.5 text-sm">
                <span className="sr-only">Your note</span>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={MAX_NOTE_LENGTH}
                  rows={3}
                  placeholder="Can't do Friday: intern last-day lunch. Any other day works."
                  className="field resize-y"
                  disabled={busy}
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                {options.length > 0 && (
                  <label className="text-sm">
                    <span className="sr-only">Which option is it about?</span>
                    <select
                      value={optionId}
                      onChange={(event) => setOptionId(event.target.value)}
                      className="field"
                      disabled={busy}
                    >
                      <option value="">About the whole event</option>
                      {options.map((option) => (
                        <option key={option.id} value={option.id}>
                          About {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {!isOrganizer && (
                  <label className="text-sm">
                    <span className="sr-only">Who should see it?</span>
                    <select
                      value={visibility}
                      onChange={(event) =>
                        setVisibility(
                          event.target.value === "organizer"
                            ? "organizer"
                            : "everyone",
                        )
                      }
                      className="field"
                      disabled={busy}
                    >
                      <option value="everyone">Everyone on this event</option>
                      <option value="organizer">
                        Only {board.event.organizerName}
                      </option>
                    </select>
                  </label>
                )}

                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busy}
                    onClick={() => {
                      setOpen(false);
                      setDraft("");
                      setNotice(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="button-primary"
                    disabled={busy || !draft.trim()}
                  >
                    {busy ? "Adding…" : "Add note"}
                  </button>
                </div>
              </div>

              {/* Said before they write, not after: the downgrade is the
                  organizer's setting, not a surprise about their own words. */}
              {boardIsPrivate && visibility === "everyone" && !isOrganizer && (
                <p className="text-xs text-muted">
                  This organizer keeps responses private, so notes go to them
                  rather than onto the board for everyone.
                </p>
              )}
            </form>
          )}

          {notice && (
            <p className="mt-3 text-xs text-muted" role="status">
              {notice}
            </p>
          )}
        </>
      )}
    </section>
  );
}
