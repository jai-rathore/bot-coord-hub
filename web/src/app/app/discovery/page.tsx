import { DiscoveryManager } from "@/components/discovery-manager";
import { PageHeading } from "@/components/page-heading";
import {
  listDiscoveryCatalog,
  listDiscoveryInterests,
  listUserDiscoveryAudit,
} from "@/lib/discovery-service";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage() {
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }
  const [intents, interests, audit] = await Promise.all([
    listDiscoveryCatalog(user.id, { includeOwnerReview: true }),
    listDiscoveryInterests(user.id),
    listUserDiscoveryAudit(user.id),
  ]);
  return (
    <div>
      <PageHeading
        eyebrow="Private matching"
        title="Discovery"
        description="Choose what your agent may look for. HoneyMatcha compares private constraints, keeps candidates anonymous, and releases only approved fields after mutual interest."
      />
      <div className="mt-8">
        <DiscoveryManager
          initialIntents={intents}
          initialInterests={interests}
          initialAudit={audit.map((row) => ({
            id: row.id,
            action: row.action,
            metadata: row.metadata,
            createdAt: row.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
