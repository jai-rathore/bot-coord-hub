import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CopyBlock } from "@/components/copy-block";
import { EventClient } from "@/components/event-client";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import {
  loadBoardSource,
  loadEventActivity,
  projectBoard,
} from "@/lib/events/board";
import { markEventSeen } from "@/lib/events/updates";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

/** The origin people actually reached us on, so a copied link is pasteable. */
async function currentOrigin(): Promise<string> {
  const list = await headers();
  const proto = list.get("x-forwarded-proto") ?? "https";
  const host =
    list.get("x-forwarded-host") ?? list.get("host") ?? "honeymatcha.io";
  return `${proto}://${host}`;
}

export default async function OrganizerEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!eventsFeatureEnabled()) notFound();
  const { id } = await params;

  // Independent of each other: the account read does not gate the board load.
  const [user, source] = await Promise.all([
    ensureCurrentUser(),
    loadBoardSource(id),
  ]);
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }
  if (!source) notFound();

  // Non-organizers get the participant view at the public URL instead.
  const isOrganizer = source.event.organizerUserId === user.id;
  const board = projectBoard(source, user.id);

  // markEventSeen is a write the render does not read back, and the activity
  // list does not depend on it, so all three run together instead of the page
  // waiting on each in turn.
  const [, activity, origin] = await Promise.all([
    markEventSeen(id, user.id),
    isOrganizer ? loadEventActivity(id) : Promise.resolve([]),
    currentOrigin(),
  ]);
  const shareUrl = `${origin}/e/${board.event.shareSlug}`;

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
          {/* The whole URL, not just the path: someone reading this off the
              screen or copying it by hand needs something that resolves. */}
          <div className="mt-3">
            <CopyBlock text={shareUrl} label="Copy link" />
          </div>
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
