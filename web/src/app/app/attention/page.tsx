import { ConfirmQueue } from "@/components/confirm-queue";
import { PageHeading } from "@/components/page-heading";
import { listConfirmsForUser } from "@/lib/confirms";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function AttentionPage() {
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }
  const confirms = await listConfirmsForUser(user, "pending");

  return (
    <div>
      <PageHeading
        eyebrow="Human approval"
        title="Needs your attention"
        description="Things your agent paused for you to approve or decline. An agent credential can never decide these in your place."
      />
      <div className="mt-9">
        <ConfirmQueue initialConfirms={confirms} />
      </div>
    </div>
  );
}
