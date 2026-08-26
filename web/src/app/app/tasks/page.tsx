import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { TaskRequestForm } from "@/components/task-request-form";
import { listRegistryIntents } from "@/lib/intents";
import { intentLabel, taskStatusLabel } from "@/lib/intent-labels";
import { isVisibleHomeTask } from "@/lib/home-status";
import { listSessionsForUser } from "@/lib/sessions";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }
  const [sessions, registry] = await Promise.all([
    listSessionsForUser(user),
    listRegistryIntents(),
  ]);
  const listedSessions = sessions.filter((session) =>
    isVisibleHomeTask(session.status),
  );
  const supportedTasks = registry
    .filter((item) => item.status === "live")
    .map((item) => ({
      slug: item.slug,
      name: item.name,
      description: item.description,
    }));

  return (
    <div>
      <PageHeading
        eyebrow="Coordination"
        title="Tasks"
        description="See what Sage or your connected agent is working on, then request a capability you want HoneyMatcha to support next."
      />

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold tracking-[-0.03em] text-matcha-deep">
          In progress and recent
        </h2>
        {listedSessions.length ? (
          <ul className="surface-card mt-4 divide-y divide-line px-5">
            {listedSessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4"
              >
                <div>
                  <p className="font-medium text-ink">
                    {intentLabel(session.intentType)}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {session.peer?.name ??
                      session.peer?.email ??
                      (session.participants.length > 2
                        ? `${session.participants.length} people`
                        : "Your task")}{" "}
                    · {taskStatusLabel(session.status)}
                  </p>
                </div>
                <Link href={`/app/activity?session=${session.id}`}>Open</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-matcha-soft/40 bg-white/40 p-6 text-sm text-muted">
            No tasks yet. Once your assistant starts coordinating, its work
            appears here.
          </p>
        )}
      </section>

      <section className="mt-10 rounded-2xl border border-matcha-soft/35 bg-matcha-soft/8 p-5 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
        <div>
          <p className="section-kicker">Recruiting</p>
          <h2 className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
            Align before the first call
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Share role terms, learn candidate-approved expectations, and revise
            the offer without another cold outreach loop.
          </p>
        </div>
        <Link href="/app/recruiting" className="button-primary mt-4 shrink-0 sm:mt-0">
          Open recruiting
        </Link>
      </section>

      <div className="mt-10">
        <TaskRequestForm supportedTasks={supportedTasks} />
      </div>
    </div>
  );
}
