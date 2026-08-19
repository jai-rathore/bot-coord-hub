import Link from "next/link";
import { notFound } from "next/navigation";
import { EventUpdatePill } from "@/components/event-update-pill";
import { PageHeading } from "@/components/page-heading";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import { relativeDeadline } from "@/lib/events/copy";
import { listEventsWithUpdates } from "@/lib/events/load-updates";
import {
  eventsForDashboard,
  type EventWithUpdates,
} from "@/lib/events/updates";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * One event, one card.
 *
 * This page used to split the same set of events across two headed sections,
 * so a single plan could be read as two different things depending on which
 * list it happened to land in. Whether you started it or were invited to it is
 * a property of the event, not a place to file it — so it is a label on the
 * card and the list is one list, ordered by what needs you first.
 */
export default async function EventsPage() {
  if (!eventsFeatureEnabled()) notFound();
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }

  const { organized, joined } = await listEventsWithUpdates(user);
  const organizedIds = new Set(organized.map((event) => event.id));
  const all = eventsForDashboard(
    [...organized, ...joined],
    organized.length + joined.length,
  );

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Events"
        title="Events"
        description="Everything you're planning or have been invited to, newest news first."
        action={
          <Link href="/app/events/new" className="button-primary w-full sm:w-auto">
            Create an event
          </Link>
        }
      />

      {all.length === 0 ? (
        <p className="text-sm leading-6 text-muted">
          Nothing yet. Create one and share the link in a group chat — people
          can see it straight away and sign in only when they answer.
        </p>
      ) : (
        <ul className="space-y-3">
          {all.map((event) => (
            <li key={event.id}>
              <EventListCard
                event={event}
                organizing={organizedIds.has(event.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventListCard({
  event,
  organizing,
}: {
  event: EventWithUpdates;
  organizing: boolean;
}) {
  return (
    <Link
      href={event.href}
      className="surface-card surface-card-interactive flex items-center justify-between gap-3 p-4 no-underline"
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{event.title}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[0.62rem] font-bold tracking-[0.08em] uppercase ${
              organizing
                ? "bg-matcha-soft/18 text-matcha"
                : "bg-line/60 text-muted"
            }`}
          >
            {organizing ? "Organizing" : "Invited"}
          </span>
        </span>
        <span className="mt-1 block text-sm text-muted">
          {event.latestUpdate ??
            (event.status === "open"
              ? relativeDeadline(event.deadlineAt)
              : event.status)}
        </span>
      </span>
      <EventUpdatePill unreadCount={event.unreadCount} />
    </Link>
  );
}
