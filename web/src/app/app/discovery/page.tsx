import { DiscoveryManager } from "@/components/discovery-manager";
import { PageHeading } from "@/components/page-heading";
import {
  listDiscoveryCatalog,
  listDiscoveryInterests,
  listUserDiscoveryAudit,
} from "@/lib/discovery-service";
import { ensureCurrentUser } from "@/lib/users";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage() {
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }
  if (!discoveryFeatureEnabled()) {
    return (
      <div>
        <PageHeading
          eyebrow="Private matching"
          title="Discovery is not enabled yet"
          description="Your existing coordination tools remain available. HoneyMatcha will show enrollment and introduction controls here when secure discovery is enabled."
        />
      </div>
    );
  }
  const [intents, interests, audit] = await Promise.all([
    listDiscoveryCatalog(user.id, { includeOwnerReview: true }),
    listDiscoveryInterests(user.id, { includeStableIds: true }),
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
