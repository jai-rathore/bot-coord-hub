import { PageHeading } from "@/components/page-heading";
import { SafetyReportsManager } from "@/components/safety-reports-manager";
import { listSafetyReportsForModeration } from "@/lib/discovery-service";
import { isIntentAdmin } from "@/lib/intent-moderation";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function SafetyReportsPage() {
  const user = await ensureCurrentUser();
  if (!user || !isIntentAdmin(user)) {
    return <p className="text-danger">Not authorized.</p>;
  }
  const reports = await listSafetyReportsForModeration();
  return (
    <div>
      <PageHeading
        eyebrow="Trust and safety"
        title="Discovery reports"
        description="Review reports, restrict discovery access, and suspend accounts before they can continue matching."
      />
      <div className="mt-8">
        <SafetyReportsManager
          initialReports={reports.map((report) => ({
            id: report.id,
            reasonCode: report.reasonCode,
            details: report.details,
            status: report.status,
            moderatorNotes: report.moderatorNotes,
            createdAt: report.createdAt.toISOString(),
            reporter: report.reporter,
            subject: report.subject,
          }))}
        />
      </div>
    </div>
  );
}
