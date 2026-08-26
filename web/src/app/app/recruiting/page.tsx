import Link from "next/link";
import { CopyBlock } from "@/components/copy-block";
import { DiscoveryManager } from "@/components/discovery-manager";
import { HiringAlignmentWorkspace } from "@/components/hiring-alignment-workspace";
import { PageHeading } from "@/components/page-heading";
import { SageGuestRequestForm } from "@/components/sage-guest-request-form";
import { getProfileForUser } from "@/lib/agent-profiles";
import { appOrigin } from "@/lib/connect-copy";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";
import {
  listDiscoveryCatalog,
  listDiscoveryInterests,
  listDiscoveryRecommendations,
  listUserDiscoveryAudit,
} from "@/lib/discovery-service";
import { listHiringAlignmentsForOrganizer } from "@/lib/guest-tasks";
import { listDiscoveryCadences } from "@/lib/sage/discovery-cadence";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function RecruitingPage() {
  const user = await ensureCurrentUser();
  if (!user)
    return <p className="text-danger">Unable to resolve your account.</p>;
  const [
    alignments,
    catalog,
    interests,
    recommendations,
    cadences,
    audit,
    profile,
  ] = await Promise.all([
    listHiringAlignmentsForOrganizer(user),
    discoveryFeatureEnabled()
      ? listDiscoveryCatalog(user.id, { includeOwnerReview: true })
      : Promise.resolve([]),
    discoveryFeatureEnabled()
      ? listDiscoveryInterests(user.id, { includeStableIds: true })
      : Promise.resolve([]),
    discoveryFeatureEnabled()
      ? listDiscoveryRecommendations(user.id)
      : Promise.resolve([]),
    discoveryFeatureEnabled()
      ? listDiscoveryCadences(user.id)
      : Promise.resolve([]),
    discoveryFeatureEnabled()
      ? listUserDiscoveryAudit(user.id)
      : Promise.resolve([]),
    getProfileForUser(user.id),
  ]);
  const hiringIntent = catalog.find(
    (intent) => intent.slug === "hiring_compatibility",
  );
  const ownerClaims = hiringIntent?.currentEnrollment.ownerReview
    ? {
        ...hiringIntent.currentEnrollment.ownerReview.claims.public,
        ...hiringIntent.currentEnrollment.ownerReview.claims.private,
        ...hiringIntent.currentEnrollment.ownerReview.claims
          .disclosureAfterMatch,
      }
    : {};
  const participantType =
    ownerClaims.participantType === "candidate" ||
    ownerClaims.participantType === "employer"
      ? ownerClaims.participantType
      : null;
  const candidateLink =
    participantType === "candidate" && profile
      ? `${appOrigin()}/${profile.handle}?hire=1`
      : null;

  return (
    <div>
      <PageHeading
        eyebrow="Recruiting alignment"
        title="Give your agent a recruiting mandate."
        description="Candidates define what would make a role worth engaging with. Recruiters define what they can actually offer. Agents search and negotiate the gap; people enter only when there is a credible reason to talk."
      />

      {candidateLink ? (
        <section className="mt-8 overflow-hidden rounded-3xl border border-matcha-soft/45 bg-[linear-gradient(120deg,rgba(23,63,46,0.98),rgba(42,91,66,0.94))] p-5 text-white shadow-[0_18px_50px_rgba(23,63,46,0.16)] sm:p-7">
          <p className="font-mono text-[0.68rem] font-bold tracking-[0.12em] text-honey-soft uppercase">
            Your candidate-owned link
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-fraunces)] text-2xl font-semibold">
            “Before you pitch me, let our agents check the role.”
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
            Give this link to a recruiter or their agent. They submit the real
            role terms once; your agent compares them with your private mandate
            and returns only the alignment signal you approved.
          </p>
          <div className="mt-5 max-w-2xl rounded-2xl bg-white p-4 text-ink">
            <p className="mb-2 break-all font-mono text-xs text-matcha-deep">
              {candidateLink}
            </p>
            <CopyBlock text={candidateLink} label="Copy my recruiting link" />
          </div>
        </section>
      ) : participantType === "candidate" ? (
        <section className="surface-card mt-8 p-5 sm:p-7">
          <p className="section-kicker">Your candidate-owned link</p>
          <h2 className="mt-1 text-xl font-semibold text-matcha-deep">
            Choose a public handle to receive private role briefs.
          </h2>
          <Link href="/setup" className="button-primary mt-4 inline-flex">
            Choose my handle
          </Link>
        </section>
      ) : null}

      {hiringIntent ? (
        <div className="mt-8">
          <DiscoveryManager
            initialIntents={[hiringIntent]}
            initialInterests={interests.filter(
              (interest) => interest.intentSlug === "hiring_compatibility",
            )}
            initialRecommendations={recommendations.filter(
              (recommendation) =>
                recommendation.intentSlug === "hiring_compatibility",
            )}
            initialCadences={cadences.filter(
              (cadence) => cadence.intentSlug === "hiring_compatibility",
            )}
            initialAudit={audit
              .filter(
                (row) => row.metadata?.intentSlug === "hiring_compatibility",
              )
              .map((row) => ({
                id: row.id,
                action: row.action,
                metadata: row.metadata,
                createdAt: row.createdAt.toISOString(),
              }))}
            hideIntentSwitcher
          />
        </div>
      ) : (
        <section className="surface-card mt-8 p-5 text-sm text-muted sm:p-7">
          Private recruiting discovery is not enabled in this environment.
        </section>
      )}

      {participantType === "employer" ? (
        <section className="mt-12" aria-labelledby="alignment-memos">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="section-kicker">In progress</p>
              <h2
                id="alignment-memos"
                className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep"
              >
                Alignment memos
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted">
              Gap-only responses never expose the candidate&apos;s raw values.
              Exact detail appears only when they approve it.
            </p>
          </div>
          <HiringAlignmentWorkspace items={alignments} />
        </section>
      ) : null}

      {participantType === "employer" ? (
        <div className="mt-12 border-t border-line pt-10 pb-12">
          <div className="mb-5">
            <p className="section-kicker">Already have someone in mind?</p>
            <h2 className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
              Send one candidate a private alignment brief.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              This targeted flow lets their agent return approved gaps without
              asking the candidate to write a cold reply.
            </p>
          </div>
          <SageGuestRequestForm />
        </div>
      ) : null}
    </div>
  );
}
