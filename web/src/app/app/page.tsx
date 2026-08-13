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

  return (
    <div className="space-y-10">
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
        {setupComplete ? `Good to see you, ${name}` : `Welcome, ${name}`}
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        {setupComplete
          ? "Your agent handles coordination. You will see progress here and step in only when something needs your say."
          : "HoneyMatcha is where your personal agent works. Connect a calendar, then ask your agent to connect. After that, you talk to the agent — not this site — unless something needs your say."}
      </p>

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

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
            Recent tasks
          </h2>
          <Link href="/app/tasks" className="text-sm font-medium">
            View all
          </Link>
        </div>
        {status.recentTasks.length ? (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-white/65 px-4">
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
                <Link href={`/app/activity?session=${task.id}`}>Open</Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-line bg-white/40 p-6">
            <p className="font-medium text-ink">No tasks yet.</p>
            <p className="mt-2 max-w-xl text-sm text-muted">
              {setupComplete
                ? "Ask your agent to schedule a meeting or invite someone."
                : "Finish the two setup steps above first."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
