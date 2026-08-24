import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { SageOperationsManager } from "@/components/sage-operations-manager";
import { isIntentAdmin } from "@/lib/intent-moderation";
import {
  listSageOperationsJobs,
  sageOperationsSnapshot,
} from "@/lib/sage/operations";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function SageOperationsPage() {
  const administrator = await ensureCurrentUser();
  if (!administrator || !isIntentAdmin(administrator)) {
    return <p className="text-danger">Not authorized.</p>;
  }
  const [snapshot, jobs] = await Promise.all([
    sageOperationsSnapshot(),
    listSageOperationsJobs(),
  ]);
  return (
    <div>
      <PageHeading
        eyebrow="Internal operations"
        title="Sage queue health"
        description="Review queue age, retries, provider usage, and failed work. Requeues preserve encrypted inputs and append an administrator audit record."
      />
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <Link href="/app/admin/intents">Task administration</Link>
        <Link href="/app/admin/safety">Discovery safety</Link>
      </div>
      <div className="mt-8">
        <SageOperationsManager
          initialSnapshot={snapshot}
          initialJobs={jobs}
        />
      </div>
    </div>
  );
}
