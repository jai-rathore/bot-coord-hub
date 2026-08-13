import Link from "next/link";
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
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
        Tasks
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        What you and your agent are working on—and what you want HoneyMatcha to
        support next.
      </p>

      <section className="mt-8">
        <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
          In progress and recent
        </h2>
        {listedSessions.length ? (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-white/65 px-4">
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
          <p className="mt-3 rounded-xl border border-dashed border-line p-5 text-sm text-muted">
            No tasks yet. Once your agent starts coordinating, its work appears
            here.
          </p>
        )}
      </section>

      <div className="mt-10">
        <TaskRequestForm supportedTasks={supportedTasks} />
      </div>
    </div>
  );
}
