import Link from "next/link";
import { IntentModeration } from "@/components/intent-moderation";
import {
  canModerateProposal,
  isIntentAdmin,
  listPendingProposalsForModeration,
} from "@/lib/intent-moderation";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function AppIntentsPage() {
  const user = await ensureCurrentUser();
  let pending: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    proposedByEmail: string | null;
    triageRecommendation: "publish" | "reject" | "needs_review" | null;
    triageReason: string | null;
    triagedAt: string | null;
    createdAt: string;
    canModerate: boolean;
  }> = [];
  let loadError: string | null = null;

  if (user) {
    try {
      const rows = await listPendingProposalsForModeration();
      pending = rows.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description,
        proposedByEmail: p.proposedByEmail,
        triageRecommendation: p.triageRecommendation,
        triageReason: p.triageReason,
        triagedAt: p.triagedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        canModerate: canModerateProposal(user, p),
      }));
    } catch (err) {
      loadError = err instanceof Error ? err.message : "Database unavailable";
    }
  }

  const canRunTriage =
    Boolean(user) &&
    (!process.env.INTENT_ADMIN_EMAILS?.trim() ||
      (user ? isIntentAdmin(user) : false));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
          Intents
        </h1>
        <p className="mt-2 max-w-xl text-muted">
          Review triage notes, then publish pending proposals to live or reject
          with a reason. Live intents appear in the public registry and agent{" "}
          <code className="rounded bg-code-bg px-1">GET /api/v1/intents</code>.
        </p>
        <Link
          href="/intents"
          className="mt-4 inline-flex text-sm font-semibold text-matcha-deep no-underline hover:underline"
        >
          Open public registry →
        </Link>
      </div>

      {loadError ? (
        <p className="text-sm text-danger" role="alert">
          Could not load pending proposals: {loadError}
        </p>
      ) : (
        <IntentModeration
          initialPending={pending}
          canRunTriage={canRunTriage}
        />
      )}
    </div>
  );
}
