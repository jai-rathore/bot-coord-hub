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
        description="Name the plan and the choices you need from people. HoneyMatcha creates one link for the group, gathers their answers, and leaves the final decision with you."
      />
      <EventCreateForm />
    </div>
  );
}
