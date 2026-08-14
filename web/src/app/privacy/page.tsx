import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function PrivacyPage() {
  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f8fbf7_0%,#f4f7f3_50%,#f0ebe0_100%)]">
      <SiteHeader />
      <main className="mx-auto w-[min(44rem,calc(100%-2rem))] py-10">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-matcha">
          Last updated August 14, 2026
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-4xl font-semibold text-matcha-deep">
          Privacy
        </h1>
        <div className="mt-7 space-y-7 text-sm leading-7 text-muted">
          <section>
            <h2 className="text-lg font-semibold text-ink">What we collect</h2>
            <p className="mt-2">
              HoneyMatcha stores account details, agent connection metadata,
              people you choose to connect with, coordination tasks, decisions,
              and activity records. Agent and guest secrets are stored only as
              cryptographic hashes.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">Calendar data</h2>
            <p className="mt-2">
              When you connect Google Calendar, HoneyMatcha uses free/busy data
              to find possible times and creates events only after the required
              approval. We do not share existing event titles, descriptions, or
              attendee lists with other users. OAuth credentials are encrypted
              and can be revoked by disconnecting your calendar.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">
              Purpose-bound discovery
            </h2>
            <p className="mt-2">
              Discovery is opt-in for each purpose. Before an introduction,
              other users and their agents receive only a short-lived anonymous
              candidate handle, approved non-identifying fields, and a
              compatibility summary. HoneyMatcha does not disclose your email,
              stable account identifier, raw private answers, social data, or
              exact location through discovery.
            </p>
            <p className="mt-2">
              Information submitted by an agent records its source and waits
              for your approval before activation. After mutual interest, only
              the fields you approved for that disclosure stage are released.
              Declining an introduction does not reveal your reasons. Purpose
              data and derived introductions are deleted when their shortest
              approved retention period expires; safety reports are retained
              for up to one year.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">Location data</h2>
            <p className="mt-2">
              The current discovery service accepts coarse country, region,
              city, or neighborhood information. It does not request or store
              browser GPS coordinates. Coarse location is used for private
              compatibility checks and is disclosed only when your selected
              visibility policy permits it.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">Guest requests</h2>
            <p className="mt-2">
              A guest link grants access to one targeted, expiring request. It
              does not create an account or allow network access. We hash the
              recipient email and IP-derived abuse signal rather than storing
              them in raw form with the response.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">How data is used</h2>
            <p className="mt-2">
              We use data only to provide coordination, protect the service,
              support users, and improve reliability. We do not sell personal
              data or use Google user data for advertising or generalized AI
              model training.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">
              Control and deletion
            </h2>
            <p className="mt-2">
              You can revoke agent connections, relationships, guest requests,
              discovery enrollments, disclosures, and calendar access. Blocking
              a discovery participant prevents future matching and revokes
              existing discovery disclosures. For access or deletion requests,
              contact{" "}
              <a href="mailto:privacy@honeymatcha.io">
                privacy@honeymatcha.io
              </a>
              .
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">Google API data</h2>
            <p className="mt-2">
              HoneyMatcha&apos;s use and transfer of information received from
              Google APIs follows the Google API Services User Data Policy,
              including its Limited Use requirements.
            </p>
          </section>
        </div>
        <p className="mt-10 border-t border-line pt-5 text-sm text-muted">
          <Link href="/terms">Terms</Link> · <Link href="/">HoneyMatcha</Link>
        </p>
      </main>
    </div>
  );
}
