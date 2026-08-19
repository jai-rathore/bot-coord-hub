import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { CapabilityGrid } from "@/components/capability-grid";
import { EventUpdatePill } from "@/components/event-update-pill";
import { MeetCode } from "@/components/meet-code";
import { enabledCapabilities, lockedCount } from "@/lib/capabilities";
import { relativeDeadline } from "@/lib/events/copy";
import type { EventWithUpdates } from "@/lib/events/updates";

/**
 * Home for someone who is signed in.
 *
 * Two questions, in order: what is waiting on me, and what else can I hand
 * off. The second used to be a flat row of buttons that said nothing about how
 * the product works — Discovery simply appeared, with no hint that it needs an
 * agent behind it — and the agent layer itself sat at the bottom in the
 * smallest type on the page, phrased as an apology. It is not an apology. For
 * someone with no agent it is the single action that turns four capabilities
 * on, so the grid states that plainly on every locked tile.
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
  const capabilities = enabledCapabilities({
    events: eventsEnabled,
    discovery: discoveryEnabled,
  });
  const locked = agentConnected ? 0 : lockedCount(capabilities);

  return (
    <div className="flex min-h-full flex-col bg-[radial-gradient(circle_at_8%_0%,rgba(117,161,132,0.12),transparent_25rem),radial-gradient(circle_at_94%_20%,rgba(240,220,168,0.15),transparent_24rem),linear-gradient(180deg,#f9fbf8_0%,#f4f7f3_55%,#f6f3eb_100%)]">
      <AppNav
        attentionCount={attentionCount}
        eventsUnreadCount={unreadEventCount}
        discoveryEnabled={discoveryEnabled}
        agentConnected={agentConnected}
        handle={handle}
      />

      <main className="has-tab-bar mx-auto w-full max-w-[72rem] flex-1 px-5 pt-8 sm:px-6 sm:pt-12">
        <h1 className="display-title text-3xl sm:text-4xl">
          Hey {displayName}
        </h1>
        <p className="mt-2 text-sm text-muted sm:text-base">
          {unreadEventCount > 0
            ? "Something moved while you were away."
            : "What would you like to sort out?"}
        </p>

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
            <Link href="/app/people" className="button-secondary w-full sm:w-auto">
              People
            </Link>
            {handle ? (
              <MeetCode
                handle={handle}
                displayName={firstName ?? handle}
                origin={origin}
                label="My code"
                className="button-secondary w-full cursor-pointer sm:w-auto"
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

        {capabilities.length > 0 ? (
          <section aria-labelledby="home-capabilities" className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2
                id="home-capabilities"
                className="font-[family-name:var(--font-fraunces)] text-xl font-semibold tracking-[-0.02em] text-matcha-deep"
              >
                What you can hand off
              </h2>
              <p className="text-sm text-muted">
                {agentConnected
                  ? "Your agent runs all of these."
                  : "Sage runs the first one today."}
              </p>
            </div>
            <div className="mt-4">
              <CapabilityGrid
                capabilities={capabilities}
                agentConnected={agentConnected}
              />
            </div>
          </section>
        ) : null}

        {/* The agent layer, stated as what it is: the key to the locked tiles
            above, not a footnote for enthusiasts. */}
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
            <Link
              href="/app/agent"
              className="flex items-center justify-between gap-3 rounded-2xl border border-matcha-soft/40 bg-white/70 p-4 no-underline"
            >
              <span>
                <span className="block font-semibold text-ink">
                  {locked > 0
                    ? `Unlock ${locked} more with your own agent`
                    : "Bring your own agent"}
                </span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Grok, Claude, Cursor, or anything speaking MCP. One browser
                  approval and it runs everything above — Sage keeps handling
                  the rest either way.
                </span>
              </span>
              <span className="shrink-0 font-semibold text-matcha-deep">
                Connect <span aria-hidden="true">&rarr;</span>
              </span>
            </Link>
          )}
        </section>
      </main>
    </div>
  );
}
