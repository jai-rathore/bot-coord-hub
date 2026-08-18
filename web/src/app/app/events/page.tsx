import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import { listEventsForUser } from "@/lib/events/service";
import { relativeDeadline } from "@/lib/events/copy";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  if (!eventsFeatureEnabled()) notFound();
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }

  const { organized, joined } = await listEventsForUser(user);

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Events"
        title="Events"
        description="Group plans you're running, and the ones you've been invited to."
      />

      <div>
        <Link href="/app/events/new" className="button-primary">
          Create an event
        </Link>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-ink">You&apos;re organizing</h2>
        {organized.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nothing yet. Create one and share the link in a group chat — people
            can see it straight away and sign in only when they answer.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {organized.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/app/events/${event.id}`}
                  className="surface-card surface-card-interactive flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <span>
                    <span className="block font-semibold text-ink">
                      {event.title}
                    </span>
                    <span className="block text-xs text-muted">
                      {event.status === "open"
                        ? relativeDeadline(event.deadlineAt)
                        : event.status}
                    </span>
                  </span>
                  <span className="text-xs text-muted">/e/{event.shareSlug}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ink">You&apos;ve been invited</h2>
        {joined.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Events you respond to will show up here.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {joined.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/e/${event.shareSlug}`}
                  className="surface-card surface-card-interactive flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <span>
                    <span className="block font-semibold text-ink">
                      {event.title}
                    </span>
                    <span className="block text-xs text-muted">
                      {event.status === "open"
                        ? relativeDeadline(event.deadlineAt)
                        : event.status}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
