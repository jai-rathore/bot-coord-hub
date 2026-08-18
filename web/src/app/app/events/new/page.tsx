import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { EventCreateForm } from "@/components/event-create-form";
import { eventsFeatureEnabled } from "@/lib/events-feature";

export const dynamic = "force-dynamic";

export default function NewEventPage() {
  if (!eventsFeatureEnabled()) notFound();
  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Events"
        title="Start something"
        description="One link, shared wherever your group already talks. People tap what works; you decide."
      />
      <EventCreateForm />
    </div>
  );
}
