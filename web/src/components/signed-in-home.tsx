import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { CapabilityMark } from "@/components/capability-mark";
import { EventUpdatePill } from "@/components/event-update-pill";
import { MeetCode } from "@/components/meet-code";
import {
  SageProactiveUpdates,
  type SageProactiveUpdate,
} from "@/components/sage-proactive-updates";
import { relativeDeadline } from "@/lib/events/copy";
import type { EventWithUpdates } from "@/lib/events/updates";

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
  sageName,
  sageUpdates,
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
  sageName: string;
  sageUpdates: SageProactiveUpdate[];
}) {
  const displayName = firstName ?? "there";
  const activeAgent = agentConnected ? "your connected agent" : sageName;
  const journeys = [
    {
      href: "/app/recruiting",
      title: "Align a recruiting conversation",
      body: "Let candidate and recruiter agents surface fit gaps before either person commits to a call.",
      detail: "Company, role, compensation, equity",
      glyph: "briefcase" as const,
    },
    ...(eventsEnabled
      ? [
          {
            href: "/app/events/new",
            title: "Plan with a group",
            body: "Share one link, collect everyone's availability, and settle the plan.",
            detail: "Dinners, trips, team days",
            glyph: "calendar" as const,
          },
        ]
      : []),
    {
      href: "/app/agent",
      title: "Schedule one-on-one",
      body:
        "Ask " +
        activeAgent +
        " to coordinate calendars with another person or agent.",
      detail: "Coffee, calls, introductions",
      glyph: "handshake" as const,
    },
    ...(discoveryEnabled
      ? [
          {
            href: "/app/discovery",
            title: "Find the right people",
            body: "Set private criteria, let Sage search, and reveal identities only after mutual interest.",
            detail: "Dating, hiring, local meetups",
            glyph: "search" as const,
          },
        ]
      : []),
  ];

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
        <header className="max-w-3xl">
          <p className="section-kicker">Your coordination desk</p>
          <h1 className="display-title mt-2 text-3xl sm:text-5xl">
            What should we coordinate, {displayName}?
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">
            Start with the outcome. {activeAgent} can handle the follow-up,
            work with other people&apos;s agents, and bring the decision back to
            you.
          </p>
        </header>

        <section aria-labelledby="start-here" className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="start-here" className="text-sm font-semibold text-ink">
              Start here
            </h2>
            <p className="text-xs text-muted">Every panel below opens a workflow.</p>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {journeys.map((journey) => (
              <Link
                key={journey.href}
                href={journey.href}
                className="action-tile group flex min-h-[13rem] flex-col p-5 no-underline"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-matcha">
                    <CapabilityMark glyph={journey.glyph} />
                  </span>
                  <span className="text-sm font-semibold text-matcha-deep transition-transform group-hover:translate-x-1">
                    Open <span aria-hidden="true">→</span>
                  </span>
                </span>
                <span className="mt-6 block font-[family-name:var(--font-fraunces)] text-2xl font-semibold tracking-[-0.03em] text-matcha-deep">
                  {journey.title}
                </span>
                <span className="mt-2 block text-sm leading-6 text-muted">
                  {journey.body}
                </span>
                <span className="mt-auto block pt-5 text-xs font-semibold tracking-[0.06em] text-matcha uppercase">
                  {journey.detail}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <SageProactiveUpdates updates={sageUpdates} />

        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {!calendarConnected ? (
            <Link
              href="/app/settings"
              className="flex items-center justify-between gap-3 border-y border-honey/45 bg-honey-soft/18 px-1 py-4 text-sm no-underline sm:px-4"
            >
              <span>
                <span className="block font-semibold text-ink">
                  Connect Google Calendar
                </span>
                <span className="mt-1 block text-muted">
                  Needed before an agreed time can be booked.
                </span>
              </span>
              <span className="shrink-0 font-semibold text-matcha-deep">
                Connect <span aria-hidden="true">→</span>
              </span>
            </Link>
          ) : (
            <div className="flex items-center gap-3 border-y border-line px-1 py-4 text-sm sm:px-4">
              <span className="live-dot bg-matcha" aria-hidden="true" />
              <span>
                <span className="block font-semibold text-ink">
                  Calendar connected
                </span>
                <span className="mt-1 block text-muted">
                  Free and busy windows are ready for coordination.
                </span>
              </span>
            </div>
          )}

          <Link
            href="/app/agent"
            className="flex items-center justify-between gap-3 border-y border-line px-1 py-4 text-sm no-underline sm:px-4"
          >
            <span>
              <span className="block font-semibold text-ink">
                {agentConnected ? "Your own agent is connected" : `Using ${sageName}`}
              </span>
              <span className="mt-1 block text-muted">
                {agentConnected
                  ? "Review its access, activity, and operator preference."
                  : "Sage is included. Connect another agent only if you prefer it."}
              </span>
            </span>
            <span className="shrink-0 font-semibold text-matcha-deep">
              Manage <span aria-hidden="true">→</span>
            </span>
          </Link>
        </div>

        {eventsEnabled ? (
          <section aria-labelledby="home-events" className="mt-12">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
              <div>
                <p className="section-kicker">In progress</p>
                <h2
                  id="home-events"
                  className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold tracking-[-0.03em] text-matcha-deep"
                >
                  Your plans
                </h2>
              </div>
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
              <div className="grid gap-2 py-6 sm:grid-cols-[1fr_auto] sm:items-center">
                <p className="text-sm leading-6 text-muted">
                  No active plans yet. Start with a group event when you need to
                  gather availability from several people at once.
                </p>
                <Link
                  href="/app/events/new"
                  className="mt-2 text-sm font-semibold text-matcha-deep sm:mt-0"
                >
                  Plan something <span aria-hidden="true">→</span>
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {events.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={event.href}
                      className="group flex items-center justify-between gap-3 py-4 no-underline"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink group-hover:text-matcha-deep">
                          {event.title}
                        </span>
                        <span className="mt-1 block text-sm text-muted">
                          {event.latestUpdate ??
                            (event.status === "open"
                              ? relativeDeadline(event.deadlineAt)
                              : event.status)}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <EventUpdatePill unreadCount={event.unreadCount} />
                        <span className="text-matcha-deep" aria-hidden="true">→</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section aria-labelledby="quick-access" className="mt-12 border-t border-line pt-6">
          <div className="grid gap-5 lg:grid-cols-[0.55fr_1.45fr]">
            <div>
              <p className="section-kicker">Useful between tasks</p>
              <h2
                id="quick-access"
                className="display-title mt-2 text-2xl sm:text-3xl"
              >
                Share and reconnect.
              </h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link href="/app/people" className="button-secondary w-full">
                Open connections
              </Link>
              {handle ? (
                <MeetCode
                  handle={handle}
                  displayName={firstName ?? handle}
                  origin={origin}
                  label="Show my meeting code"
                  className="button-secondary w-full cursor-pointer"
                />
              ) : null}
              {attentionCount > 0 ? (
                <Link href="/app/attention" className="button-secondary w-full">
                  Review {attentionCount} approval{attentionCount === 1 ? "" : "s"}
                </Link>
              ) : null}
              <Link href="/app/agent" className="button-secondary w-full">
                Agent settings
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
