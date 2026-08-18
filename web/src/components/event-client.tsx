"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { EventChat } from "@/components/event-chat";
import { ShareQr } from "@/components/share-qr";
import type { EventBoard, EventPref, OptionTally } from "@/lib/events/types";

const CYCLE: Record<string, EventPref> = {
  none: "yes",
  yes: "maybe",
  maybe: "no",
  no: "yes",
};

const PREF_LABEL: Record<EventPref, string> = {
  yes: "Yes",
  maybe: "Maybe",
  no: "No",
};

function prefClasses(pref: EventPref | null, disabled: boolean): string {
  const base =
    "inline-flex min-h-11 min-w-20 items-center justify-center rounded-[0.7rem] border px-3 text-sm font-semibold transition";
  if (disabled) {
    return `${base} cursor-not-allowed border-line bg-white/50 text-muted`;
  }
  if (pref === "yes") {
    return `${base} border-transparent bg-matcha text-[#f7faf6] shadow-[0_6px_16px_rgba(47,105,74,0.25)]`;
  }
  if (pref === "maybe") {
    return `${base} border-transparent bg-honey-soft text-matcha-deep`;
  }
  if (pref === "no") {
    return `${base} border-line bg-white/70 text-muted line-through`;
  }
  return `${base} border-line bg-white/70 text-matcha-deep hover:border-matcha-soft`;
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "open"
      ? "bg-matcha/10 text-matcha-deep"
      : status === "confirmed"
        ? "bg-honey-soft text-matcha-deep"
        : status === "cancelled" || status === "expired"
          ? "bg-danger/10 text-danger"
          : "bg-code-bg text-muted";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-bold tracking-[0.12em] uppercase ${tone}`}
    >
      {status === "open" && <span className="live-dot animate-pulse-live" />}
      {status}
    </span>
  );
}

function Tally({ option }: { option: OptionTally }) {
  if (option.yes == null) {
    return <span className="text-xs text-muted">Responses are private</span>;
  }
  const total = option.yes + (option.maybe ?? 0) + (option.no ?? 0);
  const width = total === 0 ? 0 : Math.round(((option.score ?? 0) / total) * 100);
  return (
    <div className="flex flex-1 items-center gap-3">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/70"
        role="presentation"
      >
        <div
          className="h-full rounded-full bg-matcha transition-[width] duration-500"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted">
        {option.yes} yes
        {option.maybe ? ` · ${option.maybe} maybe` : ""}
      </span>
    </div>
  );
}

export function EventClient({
  initialBoard,
  signedIn,
  signInUrl,
  showOrganizerControls = false,
}: {
  initialBoard: EventBoard;
  signedIn: boolean;
  signInUrl: string;
  showOrganizerControls?: boolean;
}) {
  const [board, setBoard] = useState(initialBoard);
  const [draft, setDraft] = useState<Record<string, EventPref>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const slug = board.event.shareSlug;
  // Only read on the client; the QR panel cannot open before hydration.
  const shareUrl =
    typeof window === "undefined"
      ? `/e/${slug}`
      : `${window.location.origin}/e/${slug}`;
  const isOrganizer = board.viewer.role === "organizer";
  const canRespond = board.viewer.canRespond;

  const openTimeDimension = useMemo(
    () => board.dimensions.find((d) => d.mode === "open" && d.kind === "time"),
    [board.dimensions],
  );
  const fixedDimensions = board.dimensions.filter(
    (d) => d.mode === "fixed" && d.options.length > 0,
  );
  const isRsvpOnly = !openTimeDimension;

  const dirty = Object.keys(draft).length > 0;

  const post = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/events/${slug}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Something went wrong. Try again.");
          return null;
        }
        if (data.board) setBoard(data.board as EventBoard);
        return data;
      } catch {
        setError("Could not reach HoneyMatcha. Check your connection.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [slug],
  );

  function cycle(optionId: string, current: EventPref | null) {
    if (!canRespond) return;
    const key = current ?? "none";
    setDraft((prev) => ({ ...prev, [optionId]: CYCLE[key] }));
  }

  async function save() {
    const entries = Object.entries(draft).map(([optionId, value]) => ({
      optionId,
      value,
    }));
    if (entries.length === 0) return;
    const result = await post("/respond", { entries });
    if (result) setDraft({});
  }

  async function rsvp(value: EventPref) {
    const result = await post("/respond", { entries: [], attendance: value });
    if (result) setDraft({});
  }

  async function control(action: string, extra: Record<string, unknown> = {}) {
    await post("/controls", { action, ...extra });
  }

  async function copyStatus() {
    const text = `${board.event.title} — ${board.summary} ${shareUrl}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("Could not copy. Select the link and copy it manually.");
    }
  }

  const effectivePref = (option: OptionTally): EventPref | null =>
    draft[option.id] ?? option.mine;

  return (
    <div className="space-y-8">
      {/* ---------- header ---------- */}
      <header className="surface-card relative overflow-hidden p-6 sm:p-8">
        <div
          className="absolute -top-24 -right-16 h-56 w-56 rounded-full border border-matcha-soft/15 bg-matcha-soft/8"
          aria-hidden="true"
        />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <p className="section-kicker">
              {board.event.organizerName} is organizing
            </p>
            <StatusPill status={board.event.status} />
          </div>
          <h1 className="display-title mt-2 text-3xl sm:text-4xl">
            {board.event.title}
          </h1>
          {board.event.description && (
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
              {board.event.description}
            </p>
          )}

          <p className="mt-4 text-sm font-semibold text-matcha-deep">
            {board.summary}
          </p>

          {fixedDimensions.length > 0 && (
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
              {fixedDimensions.map((dimension) => (
                <div key={dimension.id}>
                  <dt className="text-[0.7rem] font-bold tracking-[0.12em] text-muted uppercase">
                    {dimension.label}
                  </dt>
                  <dd className="text-sm font-semibold text-ink">
                    {dimension.options[0]?.label ?? "—"}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {isOrganizer && (
            <>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyStatus}
                  className="button-secondary"
                >
                  {copied ? "Copied" : "Copy status + link"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQr((open) => !open)}
                  className="button-secondary"
                  aria-expanded={showQr}
                >
                  {showQr ? "Hide QR" : "Show QR"}
                </button>
              </div>
              {/* For a room rather than a group chat: on a slide, a printed
                  card, or a phone held out at the table. */}
              {showQr && (
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <ShareQr
                    url={shareUrl}
                    alt={`QR code for ${board.event.title}`}
                    downloadName={`honeymatcha-${slug}.png`}
                    size={176}
                  />
                  <p className="max-w-xs text-xs text-muted">
                    Anyone can scan this to see the event. Responding still
                    needs a sign-in, and you confirm before anything is booked.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </header>

      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      {/* ---------- sign-in gate ---------- */}
      {!signedIn && board.event.status === "open" && (
        <div className="surface-card flex flex-wrap items-center justify-between gap-4 border-matcha-soft/40 p-5">
          <p className="text-sm text-muted">
            Sign in to respond — it takes a few seconds with Google.
          </p>
          <Link href={signInUrl} className="button-primary">
            Sign in to respond
          </Link>
        </div>
      )}

      {/* ---------- responding ---------- */}
      {isRsvpOnly ? (
        <section className="surface-card p-6 sm:p-7">
          <h2 className="text-lg font-semibold text-ink">Are you in?</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {(["yes", "maybe", "no"] as EventPref[]).map((value) => (
              <button
                key={value}
                type="button"
                disabled={!canRespond || busy}
                aria-pressed={board.viewer.attendance === value}
                onClick={() => rsvp(value)}
                className={prefClasses(
                  board.viewer.attendance === value ? value : null,
                  !canRespond || busy,
                )}
              >
                {value === "yes"
                  ? "I'm in"
                  : value === "maybe"
                    ? "Maybe"
                    : "Can't make it"}
              </button>
            ))}
          </div>
          {!signedIn && (
            <p className="mt-3 text-xs text-muted">
              You&apos;re seeing this as a visitor. Sign in to have your answer
              counted.
            </p>
          )}
          {signedIn && board.event.allowChat && (
            <div className="mt-5 border-t border-line pt-4">
              <EventChat
                slug={slug}
                agentName={board.event.agentName}
                organizerName={board.event.organizerName}
                isOrganizer={isOrganizer}
                onBoard={setBoard}
              />
            </div>
          )}
        </section>
      ) : (
        <section className="surface-card p-6 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">
              {openTimeDimension?.label ?? "When"}
            </h2>
            <p className="text-xs text-muted">
              Tap to cycle yes → maybe → no
            </p>
          </div>

          <ul className="mt-4 space-y-2">
            {openTimeDimension?.options
              .filter((o) => o.status === "active")
              .map((option) => {
                const pref = effectivePref(option);
                const isLeader = board.leader?.optionId === option.id;
                return (
                  <li
                    key={option.id}
                    className={`flex flex-col gap-3 rounded-[0.9rem] border p-3 sm:flex-row sm:items-center ${
                      isLeader
                        ? "border-honey/50 bg-honey-soft/25"
                        : "border-line bg-white/55"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {option.label ?? "Option"}
                        {isLeader && (
                          <span className="ml-2 text-[0.65rem] font-bold tracking-[0.1em] text-honey uppercase">
                            leading
                          </span>
                        )}
                      </p>
                      {option.createdByRole === "participant" && (
                        <p className="text-xs text-muted">Suggested by a guest</p>
                      )}
                      {option.voters && option.voters.length > 0 && (
                        <p className="mt-1 truncate text-xs text-muted">
                          {option.voters
                            .filter((v) => v.value !== "no")
                            .map((v) => v.name)
                            .join(", ") || "No one yet"}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 sm:w-1/2">
                      <Tally option={option} />
                      <button
                        type="button"
                        disabled={!canRespond || busy}
                        onClick={() => cycle(option.id, pref)}
                        aria-label={`Your answer for ${option.label ?? "this option"}`}
                        aria-pressed={pref != null && pref !== "no"}
                        className={prefClasses(pref, !canRespond || busy)}
                      >
                        {pref ? PREF_LABEL[pref] : "Pick"}
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>

          {openTimeDimension?.options.filter((o) => o.status === "active")
            .length === 0 && (
            <p className="mt-3 text-sm text-muted">
              No times have been offered yet.
            </p>
          )}

          {dirty && canRespond && (
            <div className="sticky bottom-4 mt-5 flex items-center justify-between gap-3 rounded-[0.9rem] border border-matcha-soft/40 bg-[rgba(255,255,252,0.94)] p-3 shadow-[0_10px_30px_rgba(23,63,46,0.12)] backdrop-blur">
              <p className="text-sm text-muted">
                {Object.keys(draft).length} change
                {Object.keys(draft).length === 1 ? "" : "s"} not saved
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setDraft({})}
                  disabled={busy}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="button-primary"
                  onClick={save}
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save my answer"}
                </button>
              </div>
            </div>
          )}

          {signedIn && board.event.allowChat && (
            <div className="mt-5 border-t border-line pt-4">
              <EventChat
                slug={slug}
                agentName={board.event.agentName}
                organizerName={board.event.organizerName}
                isOrganizer={isOrganizer}
                onBoard={setBoard}
              />
            </div>
          )}
        </section>
      )}

      {/* ---------- who's in ---------- */}
      {board.participants && board.participants.length > 0 && (
        <section className="surface-card p-6 sm:p-7">
          <h2 className="text-lg font-semibold text-ink">
            Who&apos;s in
            {board.counts.responded != null && (
              <span className="ml-2 text-sm font-normal text-muted tabular-nums">
                {board.counts.responded} of {board.counts.joined} responded
              </span>
            )}
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {board.participants.map((participant) => (
              <li
                key={participant.id}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-white/65 px-3 py-1.5 text-sm"
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${
                    participant.attendance === "yes"
                      ? "bg-matcha"
                      : participant.attendance === "maybe"
                        ? "bg-honey"
                        : participant.attendance === "no"
                          ? "bg-danger/60"
                          : "bg-line"
                  }`}
                />
                <span className="text-ink">{participant.name}</span>
                {participant.isOrganizer && (
                  <span className="text-[0.65rem] font-bold tracking-[0.1em] text-muted uppercase">
                    host
                  </span>
                )}
                <span className="sr-only">
                  {participant.attendance === "pending"
                    ? "has not responded"
                    : `answered ${participant.attendance}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {board.countsSuppressed && (
        <p className="text-xs text-muted">
          The organizer keeps responses private, so you can only see your own.
        </p>
      )}

      {/* ---------- organizer controls ---------- */}
      {isOrganizer && showOrganizerControls && (
        <section className="surface-card p-6 sm:p-7">
          <p className="section-kicker">Organizer controls</p>
          <h2 className="mt-2 text-lg font-semibold text-ink">
            Your call, not the agent&apos;s
          </h2>
          <p className="mt-1 text-sm text-muted">
            Locking stops new responses. Nothing reaches a calendar until you
            confirm it.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="button-secondary"
              disabled={busy || board.event.status !== "open"}
              onClick={() => control("lock")}
            >
              Lock responses now
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={busy}
              onClick={() => {
                const next = new Date(Date.now() + 48 * 3600_000).toISOString();
                void control("extend", { deadlineAt: next });
              }}
            >
              Give it 48 more hours
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={busy}
              onClick={() => control("rotate")}
            >
              Replace share link
            </button>
            <button
              type="button"
              className="button-secondary text-danger"
              disabled={busy || board.event.status === "cancelled"}
              onClick={() => control("cancel")}
            >
              Cancel event
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
