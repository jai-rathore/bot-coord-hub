import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { EventUpdatePill } from "@/components/event-update-pill";
import { MeetCode } from "@/components/meet-code";
import { relativeDeadline } from "@/lib/events/copy";
import type { EventWithUpdates } from "@/lib/events/updates";

/**
 * Home for someone who is signed in.
 *
 * It replaces the old dashboard outright. The dashboard's problem was that it
 * described the product to people who had already bought it: three essay cards
 * where three buttons belonged, and an agent status panel shown to people who
 * had no agent and never intended to get one. This page answers two questions
 * only — what can I start, and what is waiting on me — and every agent-shaped
 * thing lives one deliberate tap away under "Advanced agent setup".
 */
export function SignedInHome({
  firstName,
  handle,
  origin,
  events,
  unreadEventCount,
  eventsEnabled,
  discoveryEnabled,
  agentConnected,
  calendarConnected,
  attentionCount,
}: {
  firstName: string | null;
  handle: string | null;
  origin: string;
  events: EventWithUpdates[];
  unreadEventCount: number;
  eventsEnabled: boolean;
  discoveryEnabled: boolean;
  agentConnected: boolean;
  calendarConnected: boolean;
  attentionCount: number;
}) {
  const displayName = firstName ?? "there";

  return (
    <div className="flex min-h-full flex-col bg-[radial-gradient(circle_at_8%_0%,rgba(117,161,132,0.12),transparent_25rem),radial-gradient(circle_at_94%_20%,rgba(240,220,168,0.15),transparent_24rem),linear-gradient(180deg,#f9fbf8_0%,#f4f7f3_55%,#f6f3eb_100%)]">
      <AppNav
        attentionCount={attentionCount}
        eventsUnreadCount={unreadEventCount}
        discoveryEnabled={discoveryEnabled}
        agentConnected={agentConnected}
        handle={handle}
      />

      <main className="mx-auto w-full max-w-[72rem] flex-1 px-5 py-8 sm:px-6 sm:py-12">
        <h1 className="display-title text-3xl sm:text-4xl">
          Hey {displayName}
        </h1>
        <p className="mt-2 text-sm text-muted sm:text-base">
          {unreadEventCount > 0
            ? "Something moved while you were away."
            : "What would you like to sort out?"}
        </p>

        {/* One shape, one colour, one meaning: everything here is a button and
            every button does something. Nothing on this page is decoration. */}
        <div className="mt-6 space-y-3">
          {eventsEnabled ? (
            <Link
              href="/app/events/new"
              className="button-primary w-full text-base sm:w-auto sm:min-w-[16rem]"
            >
              Create an event
            </Link>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <Link href="/app/people" className="button-primary w-full sm:w-auto">
              People
            </Link>
            {discoveryEnabled ? (
              <Link
                href="/app/discovery"
                className="button-primary w-full sm:w-auto"
              >
                Discovery
              </Link>
            ) : null}
            {handle ? (
              <MeetCode
                handle={handle}
                displayName={firstName ?? handle}
                origin={origin}
                label="My code"
              />
            ) : null}
          </div>
        </div>

        {!calendarConnected ? (
          <Link
            href="/app/settings"
            className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-honey/35 bg-honey-soft/25 px-4 py-3 text-sm no-underline"
          >
            <span className="text-ink">
              Connect your calendar so times can actually be booked.
            </span>
            <span className="shrink-0 font-semibold text-matcha-deep">
              Connect <span aria-hidden="true">&rarr;</span>
            </span>
          </Link>
        ) : null}

        <section aria-labelledby="home-events" className="mt-10">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="home-events"
              className="font-[family-name:var(--font-fraunces)] text-xl font-semibold tracking-[-0.02em] text-matcha-deep"
            >
              Your plans
            </h2>
            {events.length > 0 ? (
              <Link
                href="/app/events"
                className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold no-underline"
              >
                See all
              </Link>
            ) : null}
          </div>

          {events.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-muted">
              Nothing yet. Create an event and share the link — people answer
              without signing up first.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {events.map((event) => (
                <li key={event.id}>
                  <Link
                    href={event.href}
                    className="surface-card surface-card-interactive flex items-center justify-between gap-3 p-4 no-underline"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">
                        {event.title}
                      </span>
                      <span className="mt-1 block text-sm text-muted">
                        {event.latestUpdate ??
                          (event.status === "open"
                            ? relativeDeadline(event.deadlineAt)
                            : event.status)}
                      </span>
                    </span>
                    <EventUpdatePill unreadCount={event.unreadCount} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* The whole agent layer, behind one door. People who have an agent get
            a live entry; people who do not get a single sentence they can
            ignore forever. */}
        <section className="mt-12 border-t border-line pt-6">
          {agentConnected ? (
            <Link
              href="/app/agent"
              className="surface-card surface-card-interactive flex items-center justify-between gap-3 p-4 no-underline"
            >
              <span>
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <span className="live-dot animate-pulse-live bg-matcha" />
                  Your agent is connected
                </span>
                <span className="mt-1 block text-sm text-muted">
                  Status, activity, and what it is allowed to do.
                </span>
              </span>
              <span className="shrink-0 font-semibold text-matcha-deep">
                Open <span aria-hidden="true">&rarr;</span>
              </span>
            </Link>
          ) : (
            <p className="text-sm leading-6 text-muted">
              Have an AI agent?{" "}
              <Link href="/app/agent" className="font-semibold text-matcha-deep">
                Set up advanced agent mode
              </Link>{" "}
              and it can do the back-and-forth for you. Everything above keeps
              working without one.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
