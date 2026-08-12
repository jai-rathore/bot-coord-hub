import { ActivityBoard } from "@/components/activity-board";
import { MultiPartyActivity } from "@/components/multi-party-activity";
import { listSessionsForUser } from "@/lib/sessions";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }

  let sessions: Awaited<ReturnType<typeof listSessionsForUser>> = [];
  let dbError: string | null = null;

  try {
    sessions = await listSessionsForUser(user);
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database unavailable";
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
        Activity
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Session boards in plain English — including multi-party (3+)
        schedule_meeting sessions.
      </p>

      {dbError ? (
        <p className="mt-6 text-sm text-danger" role="alert">
          Could not load activity: {dbError}. Check DATABASE_URL.
        </p>
      ) : (
        <div className="mt-6 space-y-10">
          <ActivityBoard initialSessions={sessions} />
          <section>
            <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
              Multi-party schedule
            </h2>
            <MultiPartyActivity />
          </section>
        </div>
      )}
    </div>
  );
}
