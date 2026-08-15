import Link from "next/link";
import { IntentModeration } from "@/components/intent-moderation";
import {
  canModerateProposal,
  isIntentAdmin,
  listPendingProposalsForModeration,
} from "@/lib/intent-moderation";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function IntentAdministrationPage() {
  const user = await ensureCurrentUser();
  if (!user || !isIntentAdmin(user)) {
    return (
      <div>
        <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-matcha-deep">
          Task administration
        </h1>
        <p className="mt-3 text-muted">
          This internal review surface is available only to configured
          HoneyMatcha administrators.
        </p>
      </div>
    );
  }

  const rows = await listPendingProposalsForModeration();
  const pending = rows.map((proposal) => ({
    id: proposal.id,
    slug: proposal.slug,
    name: proposal.name,
    description: proposal.description,
    proposedByEmail: proposal.proposedByEmail,
    triageRecommendation: proposal.triageRecommendation,
    triageReason: proposal.triageReason,
    triagedAt: proposal.triagedAt?.toISOString() ?? null,
    createdAt: proposal.createdAt.toISOString(),
    canModerate: canModerateProposal(user, proposal),
  }));

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-matcha">
          Internal
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-matcha-deep">
          Task administration
        </h1>
        <p className="mt-2 max-w-xl text-muted">
          Review demand and safety requirements before publishing executable
          agent capabilities.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link href="/agents/tasks">Open supported task catalog →</Link>
          <Link href="/app/admin/safety">Review discovery safety reports →</Link>
        </div>
      </div>
      <IntentModeration initialPending={pending} canRunTriage />
    </div>
  );
}
