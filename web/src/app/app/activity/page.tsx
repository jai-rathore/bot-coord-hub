import { ActivityBoard } from "@/components/activity-board";
import { MultiPartyActivity } from "@/components/multi-party-activity";
import { PageHeading } from "@/components/page-heading";
import { listSessionsForUser } from "@/lib/sessions";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
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
  const { session } = await searchParams;

  return (
    <div>
      <PageHeading
        eyebrow="Live progress"
        title="Activity"
        description="See what your agent is coordinating and who still needs to respond. If someone has not joined, share the private invite from the task."
      />

      {dbError ? (
        <p className="mt-6 text-sm text-danger" role="alert">
          Activity is temporarily unavailable: {dbError}
        </p>
      ) : (
        <div className="mt-9 space-y-12">
          <ActivityBoard
            initialSessions={sessions}
            initialSelectedId={session ?? null}
          />
          <section>
            <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
              Group coordination
            </h2>
            <MultiPartyActivity />
          </section>
        </div>
      )}
    </div>
  );
}
