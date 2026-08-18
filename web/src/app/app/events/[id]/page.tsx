import { notFound } from "next/navigation";
import { EventClient } from "@/components/event-client";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import {
  loadBoardSource,
  loadEventActivity,
  projectBoard,
} from "@/lib/events/board";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function OrganizerEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!eventsFeatureEnabled()) notFound();
  const { id } = await params;

  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }

  const source = await loadBoardSource(id);
  if (!source) notFound();

  // Non-organizers get the participant view at the public URL instead.
  const isOrganizer = source.event.organizerUserId === user.id;
  const board = projectBoard(source, user.id);
  const activity = isOrganizer ? await loadEventActivity(id) : [];

  return (
    <div className="space-y-8">
      <EventClient
        initialBoard={board}
        signedIn
        signInUrl="/sign-in"
        showOrganizerControls={isOrganizer}
      />

      {isOrganizer && (
        <section className="surface-card p-6 sm:p-7">
          <p className="section-kicker">Share it</p>
          <h2 className="mt-2 text-lg font-semibold text-ink">
            Paste this wherever your group talks
          </h2>
          <p className="mt-3 rounded-[0.8rem] border border-line bg-code-bg px-3 py-2 font-mono text-sm break-all text-matcha-deep">
            /e/{board.event.shareSlug}
          </p>
          <p className="mt-2 text-xs text-muted">
            Anyone can open it. Responding needs a sign-in, so every answer is
            tied to a real person.
          </p>
        </section>
      )}

      {isOrganizer && activity.length > 0 && (
        <section className="surface-card p-6 sm:p-7">
          <p className="section-kicker">Activity</p>
          <ul className="mt-4 space-y-2">
            {activity
              .slice()
              .reverse()
              .map((entry) => (
                <li key={entry.id} className="text-sm text-muted">
                  <span className="text-ink">{entry.summary}</span>{" "}
                  <span className="text-xs">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
