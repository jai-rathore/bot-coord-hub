import Link from "next/link";
import { EventUpdatePill } from "@/components/event-update-pill";

export function HomeEventPreview({
  title,
  href,
  deadlineLabel,
  unreadCount,
  latestUpdate,
}: {
  title: string;
  href: string;
  deadlineLabel: string;
  unreadCount: number;
  latestUpdate: string | null;
}) {
  const hasUpdate = unreadCount > 0;
  return (
    <div className="relative mx-auto w-full max-w-[31rem]">
      <div
        className="pointer-events-none absolute -inset-4 rounded-full bg-[radial-gradient(circle,rgba(117,161,132,0.26),transparent_68%)] blur-2xl sm:-inset-10"
        aria-hidden="true"
      />
      <div className="surface-card relative overflow-hidden p-3 shadow-[0_32px_80px_rgba(23,63,46,0.18)] sm:p-4">
        <div className="flex items-center justify-between border-b border-line/70 px-1 pb-3">
          <div className="flex items-center gap-2">
            <span
              className={`live-dot ${hasUpdate ? "animate-pulse-live" : ""}`}
            />
            <span className="text-xs font-semibold text-matcha-deep">
              {hasUpdate ? "There's an update" : "Your event"}
            </span>
          </div>
          {hasUpdate ? (
            <EventUpdatePill unreadCount={unreadCount} />
          ) : (
            <span className="rounded-full bg-matcha-soft/12 px-2.5 py-1 text-[0.65rem] font-semibold text-matcha">
              Open
            </span>
          )}
        </div>

        <Link
          href={href}
          className="mt-4 block rounded-2xl bg-[linear-gradient(145deg,#173f2e,#2f694a)] p-4 text-white no-underline sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.67rem] font-semibold tracking-[0.14em] text-white/60 uppercase">
                {hasUpdate ? "Needs a look" : "In progress"}
              </p>
              <p className="mt-1.5 font-[family-name:var(--font-fraunces)] text-xl font-semibold tracking-[-0.02em]">
                {title}
              </p>
              <p className="mt-1 text-xs text-white/65">
                {latestUpdate ?? "Nothing is booked until you say so."}
              </p>
            </div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
              </svg>
            </span>
          </div>
          <p className="mt-5 text-xs font-semibold text-honey-soft">
            Open event <span aria-hidden="true">&rarr;</span>
          </p>
        </Link>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line/80 bg-white/70 p-3.5">
            <p className="text-xs font-semibold text-ink">Deadline</p>
            <p className="mt-2 text-[0.68rem] leading-5 text-muted">
              {deadlineLabel}
            </p>
          </div>
          <div
            className={`rounded-2xl border p-3.5 ${
              hasUpdate
                ? "border-honey/50 bg-honey-soft/35"
                : "border-honey/35 bg-honey-soft/20"
            }`}
          >
            <p className="text-xs font-semibold text-ink">
              {hasUpdate ? "New activity" : "Your event"}
            </p>
            <p className="mt-2 text-[0.68rem] leading-5 text-muted">
              {hasUpdate
                ? `${latestUpdate ?? "There's a new update"}. Waiting for you in HoneyMatcha.`
                : "Jump in to follow progress or send the next plan."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
