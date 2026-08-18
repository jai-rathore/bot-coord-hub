import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { AgentStatusCard } from "@/components/agent-status-card";
import { SetupGuide } from "@/components/setup-guide";
import { getHomeStatus, isSetupComplete } from "@/lib/home-status";
import { intentLabel, taskStatusLabel } from "@/lib/intent-labels";
import {
  getGoogleConnection,
  googleCalendarEnabled,
  googleOAuthConfigured,
} from "@/lib/google-oauth";
import { ensureCurrentUser } from "@/lib/users";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";

export default async function AppHomePage() {
  const [clerkUser, user] = await Promise.all([
    currentUser(),
    ensureCurrentUser(),
  ]);
  const name = clerkUser?.firstName || clerkUser?.username || "there";
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }
  const [status, conn] = await Promise.all([
    getHomeStatus(user),
    getGoogleConnection(user.id),
  ]);
  const setupComplete = isSetupComplete(status);
  const discoveryEnabled = discoveryFeatureEnabled();

  const setupPanel = (
    <>
      <SetupGuide
        calendar={{
          connected: Boolean(conn),
          enabled: googleCalendarEnabled(),
          configured: googleOAuthConfigured(),
          googleAccountEmail: conn?.googleAccountEmail ?? null,
          calendarId: conn?.calendarId ?? null,
          updatedAt: conn?.updatedAt?.toISOString() ?? null,
        }}
        agent={status.agent}
      />
      {setupComplete ? <AgentStatusCard status={status} /> : null}
    </>
  );

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-matcha-soft/20 bg-[linear-gradient(135deg,rgba(255,255,252,0.96),rgba(235,244,237,0.9))] px-6 py-7 shadow-[0_20px_55px_rgba(23,63,46,0.09)] sm:px-8 sm:py-9">
        <div
          className="absolute -top-24 -right-20 h-64 w-64 rounded-full border border-matcha-soft/15 bg-matcha-soft/8"
          aria-hidden="true"
        />
        <div className="relative">
          <p className="section-kicker">
            {setupComplete ? "Workspace overview" : "Let’s get you connected"}
          </p>
          <h1 className="display-title mt-2 text-3xl sm:text-4xl">
            {setupComplete ? `Good to see you, ${name}` : `Welcome, ${name}`}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">
            {setupComplete
              ? "Your Grok Bot handles the coordination. Follow progress here and step in only when something needs your say."
              : "Connect your calendar and Grok Bot once. After that, your Bot handles the work while HoneyMatcha keeps you in control."}
          </p>
        </div>
      </section>

      {/* Until setup is done, connecting is the most useful thing on the page.
          After that it is just confirmation, so the actions come first. */}
      {setupComplete ? null : setupPanel}

      {/* Mirrors the three ways in on the marketing page, so what the product
          offers reads the same before and after signing in. */}
      <section aria-labelledby="start-title">
        <p className="section-kicker">Start something</p>
        <h2
          id="start-title"
          className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold tracking-[-0.03em] text-matcha-deep"
        >
          Who are you trying to reach?
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            {
              show: eventsFeatureEnabled(),
              eyebrow: "A group you know",
              title: "Plan an event",
              body: "One link in the group chat. It closes on your deadline instead of waiting on the quiet ones.",
              href: "/app/events/new",
              cta: "Create an event",
              secondary: { href: "/app/events", label: "See all" },
              featured: true,
            },
            {
              show: true,
              eyebrow: "One person you know",
              title: "Invite someone",
              body: "Connect by email or a link they approve. Then your agents compare free/busy for you.",
              href: "/app/people",
              cta: "Open People",
              secondary: null,
              featured: false,
            },
            {
              show: discoveryEnabled,
              eyebrow: "Someone you haven't met",
              title: "Find someone",
              body: "Describe who you're looking for. Your agent looks privately and asks before anyone is identified.",
              href: "/app/discovery",
              cta: "Open Discovery",
              secondary: null,
              featured: false,
            },
          ]
            .filter((card) => card.show)
            .map((card) => (
              <article
                key={card.title}
                className={`surface-card relative flex flex-col overflow-hidden p-5 sm:p-6 ${
                  card.featured ? "ring-1 ring-matcha-soft/35" : ""
                }`}
              >
                <span
                  className="pointer-events-none absolute -top-12 -right-10 h-32 w-32 rounded-full border border-matcha-soft/12 bg-matcha-soft/6"
                  aria-hidden="true"
                />
                <div className="relative flex flex-1 flex-col">
                  <p className="text-[0.68rem] font-bold tracking-[0.14em] text-honey uppercase">
                    {card.eyebrow}
                  </p>
                  <h3 className="mt-2 font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
                    {card.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-muted">
                    {card.body}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      href={card.href}
                      className={card.featured ? "button-primary" : "button-secondary"}
                    >
                      {card.cta}
                    </Link>
                    {card.secondary ? (
                      <Link
                        href={card.secondary.href}
                        className="rounded-lg px-3 py-2 text-sm font-semibold no-underline transition hover:bg-white/75"
                      >
                        {card.secondary.label}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
        </div>
      </section>

      {setupComplete ? setupPanel : null}

      <section>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="section-kicker">What’s happening</p>
            <h2 className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold tracking-[-0.03em] text-matcha-deep">
              Recent tasks
            </h2>
          </div>
          <Link
            href="/app/tasks"
            className="rounded-lg px-3 py-2 text-sm font-semibold no-underline transition hover:bg-white/75"
          >
            View all
          </Link>
        </div>
        {status.recentTasks.length ? (
          <ul className="surface-card mt-5 divide-y divide-line px-5">
            {status.recentTasks.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-4 py-5"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-matcha-soft/12 text-matcha">
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
                  <div>
                    <p className="font-medium text-ink">
                      {intentLabel(task.intentType)}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {taskStatusLabel(task.status)} · updated{" "}
                      {new Date(task.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/app/activity?session=${task.id}`}
                  className="text-sm font-semibold"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-matcha-soft/40 bg-white/45 p-7">
            <p className="font-medium text-ink">No tasks yet.</p>
            <p className="mt-2 max-w-xl text-sm text-muted">
              {setupComplete
                ? "Ask your Grok Bot to schedule a meeting or invite someone."
                : "Finish the two setup steps above first."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
