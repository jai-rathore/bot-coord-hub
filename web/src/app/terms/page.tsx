import Link from "next/link";
import { PublicFooter } from "@/components/public-footer";
import { SiteHeader } from "@/components/site-header";
import { PUBLIC_PAGE_SEO, publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata(PUBLIC_PAGE_SEO.terms);

export default function TermsPage() {
  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f8fbf7_0%,#f4f7f3_50%,#f0ebe0_100%)]">
      <SiteHeader />
      <main className="mx-auto w-[min(44rem,calc(100%-2rem))] py-10">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-matcha">
          Last updated August 12, 2026
        </p>
        <h1 className="display-title mt-2 text-4xl">
          Terms
        </h1>
        <div className="mt-7 space-y-7 text-sm leading-7 text-muted">
          <section>
            <h2 className="text-lg font-semibold text-ink">
              Early access service
            </h2>
            <p className="mt-2">
              HoneyMatcha is an early access coordination service. Features may
              change, and you should review important actions before relying on
              them.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">
              Your responsibility
            </h2>
            <p className="mt-2">
              You are responsible for agents and integrations you authorize,
              the people you invite, and the content you ask HoneyMatcha to
              coordinate. Do not use the service for spam, harassment,
              deception, unlawful discrimination, or unauthorized access.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">
              Guest invitations
            </h2>
            <p className="mt-2">
              Invitations must be sent only to intended recipients for a
              legitimate task. HoneyMatcha may rate-limit or suspend accounts
              that generate abusive or unwanted requests.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">Availability</h2>
            <p className="mt-2">
              We work to keep HoneyMatcha reliable but do not guarantee
              uninterrupted service. Verify consequential bookings and
              decisions in the destination system.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">Contact</h2>
            <p className="mt-2">
              Questions can be sent to{" "}
              <a href="mailto:support@honeymatcha.io">
                support@honeymatcha.io
              </a>
              .
            </p>
          </section>
        </div>
        <p className="mt-6 text-sm text-muted">
          <Link href="/how-to-connect-agents">How to connect agents</Link>.
        </p>
        <PublicFooter />
      </main>
    </div>
  );
}
