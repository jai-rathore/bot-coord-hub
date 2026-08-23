import Link from "next/link";
import { notFound } from "next/navigation";
import { EventUpdatePill } from "@/components/event-update-pill";
import { PageHeading } from "@/components/page-heading";
import { SagePortrait } from "@/components/sage-avatar";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import { relativeDeadline } from "@/lib/events/copy";
import { listEventsWithUpdates } from "@/lib/events/updates";
import { EVENT_PAGE_SIZE } from "@/lib/events/service";
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
 * a property of the event, not a place to file it, so it is a label on the
 * card and the list is one list, ordered by what needs you first.
 */
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; view?: string }>;
}) {
  if (!eventsFeatureEnabled()) notFound();
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }

  const query = await searchParams;
  const archived = query.view === "archived";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const { organized, joined, hasMore } = await listEventsWithUpdates(user, {
    archived,
    limit: EVENT_PAGE_SIZE,
    offset: (page - 1) * EVENT_PAGE_SIZE,
  });
  const organizedIds = new Set(organized.map((event) => event.id));
  const all = eventsForDashboard(
    [...organized, ...joined],
    organized.length + joined.length,
  );

  const hrefFor = (next: number) => {
    const params = new URLSearchParams();
    if (archived) params.set("view", "archived");
    if (next > 1) params.set("page", String(next));
    const qs = params.toString();
    return qs ? `/app/events?${qs}` : "/app/events";
  };

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Plans"
        title={archived ? "Archived plans" : "Group plans"}
        description={
          archived
            ? "Plans you have taken off your list. Everyone else still has theirs."
            : "Bring a group together with one link. Everyone shares what works, and you make the final call."
        }
        action={
          <Link href="/app/events/new" className="button-primary w-full sm:w-auto">
            Plan something
          </Link>
        }
      />

      {all.length === 0 ? (
        <div className="flex items-center gap-4">
          {archived ? null : (
            <SagePortrait width={104} className="hidden shrink-0 sm:block" />
          )}
          <p className="text-sm leading-6 text-muted">
            {archived
              ? "Nothing archived yet."
              : "No group plans yet. Start one, then share the link wherever your group already talks. People sign in only when they answer."}
          </p>
        </div>
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

      {(page > 1 || hasMore) && (
        <nav
          aria-label="Pages"
          className="flex items-center justify-between gap-3"
        >
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} className="button-secondary">
              &larr; Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted">Page {page}</span>
          {hasMore ? (
            <Link href={hrefFor(page + 1)} className="button-secondary">
              Older &rarr;
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <p className="border-t border-line pt-5 text-sm text-muted">
        {archived ? (
          <Link href="/app/events" className="font-semibold text-matcha-deep">
            Back to your events
          </Link>
        ) : (
          <Link
            href="/app/events?view=archived"
            className="font-semibold text-matcha-deep"
          >
            See archived events
          </Link>
        )}
      </p>
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
