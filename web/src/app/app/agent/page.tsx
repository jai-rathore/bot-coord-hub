import Link from "next/link";
import { AgentOperatorControl } from "@/components/agent-operator-control";
import { AgentStatusCard } from "@/components/agent-status-card";
import { AssistantSetupGuide } from "@/components/assistant-setup-guide";
import { PageHeading } from "@/components/page-heading";
import { SagePortrait } from "@/components/sage-avatar";
import { SageScheduleForm } from "@/components/sage-schedule-form";
import { SetupGuide } from "@/components/setup-guide";
import { getHomeStatus } from "@/lib/home-status";
import { intentLabel, taskStatusLabel } from "@/lib/intent-labels";
import {
  getGoogleConnection,
  googleCalendarEnabled,
  googleOAuthConfigured,
} from "@/lib/google-oauth";
import { ensureCurrentUser } from "@/lib/users";
import { getAgentOperatorMode } from "@/lib/sage/job-store";

export const dynamic = "force-dynamic";

/**
 * Assistant connection and controls, in one place.
 *
 * Everything an agent brings with it — pairing, credentials, capabilities, the
 * task log — used to be scattered through the dashboard and the nav, where it
 * was the first thing a brand-new person saw and the last thing they needed.
 * It all lives behind this one door now, so the rest of HoneyMatcha can be used
 * by hand without ever meeting it.
 */
export default async function AgentPage() {
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }

  const [status, conn, operatorMode] = await Promise.all([
    getHomeStatus(user),
    getGoogleConnection(user.id),
    getAgentOperatorMode(user.id),
  ]);

  const links = [
    {
      href: "/app/activity",
      title: "Activity",
      body: "Every move an agent has made on your behalf.",
    },
    {
      href: "/app/tasks",
      title: "Capabilities",
      body: "What agents are allowed to ask for.",
    },
    {
      href: "/app/keys",
      title: "Connections and keys",
      body: "Credentials, pairings, and revoking access.",
    },
    {
      href: "/agents",
      title: "Connection guide",
      body: "MCP, A2A, and pairing from scratch.",
    },
  ];

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Your personal agent"
        title="Your assistant"
        description="You already have an agent — Sage came with the account and works only for you. Connect one of your own if you prefer; both use the same HoneyMatcha capabilities and the same human approval boundaries."
      />

      <div className="flex items-center gap-4 rounded-2xl border border-matcha-soft/35 bg-matcha/5 p-4 sm:p-5">
        <SagePortrait width={92} className="hidden shrink-0 sm:block" />
        <p className="text-sm leading-6 text-muted">
          Whichever one is running, the boundary is the same: it can ask,
          compare, and propose. It cannot approve on your behalf, and it never
          sees the titles on your calendar.
        </p>
      </div>

      <SageScheduleForm />

      <AgentOperatorControl initialMode={operatorMode} />

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

      {status.agent.connected ? <AgentStatusCard status={status} /> : null}

      <AssistantSetupGuide />

      <section aria-labelledby="agent-links-title">
        <h2
          id="agent-links-title"
          className="font-[family-name:var(--font-fraunces)] text-xl font-semibold tracking-[-0.02em] text-matcha-deep"
        >
          Assistant controls
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="surface-card surface-card-interactive p-4 no-underline"
            >
              <span className="font-semibold text-matcha-deep">
                {link.title}
              </span>
              <span className="mt-1 block text-sm leading-6 text-muted">
                {link.body}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="agent-tasks-title">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="agent-tasks-title"
            className="font-[family-name:var(--font-fraunces)] text-xl font-semibold tracking-[-0.02em] text-matcha-deep"
          >
            Recent tasks
          </h2>
          {status.recentTasks.length ? (
            <Link
              href="/app/tasks"
              className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold no-underline"
            >
              View all
            </Link>
          ) : null}
        </div>
        {status.recentTasks.length ? (
          <ul className="surface-card mt-4 divide-y divide-line px-5">
            {status.recentTasks.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <p className="font-medium text-ink">
                    {intentLabel(task.intentType)}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {taskStatusLabel(task.status)} · updated{" "}
                    {new Date(task.updatedAt).toLocaleString()}
                  </p>
                </div>
                <Link
                  href={`/app/activity?session=${task.id}`}
                  className="min-h-11 py-2 text-sm font-semibold"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-6 text-muted">
            {status.agent.connected
              ? "Nothing yet. Ask your agent to schedule a meeting or invite someone."
              : "Once an agent is connected, what it does shows up here."}
          </p>
        )}
      </section>
    </div>
  );
}
