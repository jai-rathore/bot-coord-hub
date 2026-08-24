import { DiscoveryManager } from "@/components/discovery-manager";
import { PageHeading } from "@/components/page-heading";
import {
  listDiscoveryCatalog,
  listDiscoveryInterests,
  listDiscoveryRecommendations,
  listUserDiscoveryAudit,
} from "@/lib/discovery-service";
import { ensureCurrentUser } from "@/lib/users";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";
import { listDiscoveryCadences } from "@/lib/sage/discovery-cadence";

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
  const [intents, interests, audit, recommendations, cadences] = await Promise.all([
    listDiscoveryCatalog(user.id, { includeOwnerReview: true }),
    listDiscoveryInterests(user.id, { includeStableIds: true }),
    listUserDiscoveryAudit(user.id),
    listDiscoveryRecommendations(user.id),
    listDiscoveryCadences(user.id),
  ]);
  return (
    <div>
      <PageHeading
        eyebrow="Private discovery"
        title="Find the right people"
        description="Tell Sage or your connected agent what you are looking for in dating, hiring, or local meetups. HoneyMatcha compares private criteria, keeps dating introductions 18+, and reveals identities only after both people accept."
      />
      <div className="mt-8">
        <DiscoveryManager
          initialIntents={intents}
          initialInterests={interests}
          initialRecommendations={recommendations}
          initialCadences={cadences}
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
