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
        eyebrow="Plans"
        title="Plan with a group"
        description="Tell Sage what the group needs to decide. Sage creates one link, HoneyMatcha gathers the answers, and the final decision stays with you."
      />
      <EventCreateForm />
    </div>
  );
}
