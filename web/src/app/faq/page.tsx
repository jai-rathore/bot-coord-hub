import Link from "next/link";
import { FaqList } from "@/components/faq-list";
import { JsonLd } from "@/components/json-ld";
import { PublicFooter } from "@/components/public-footer";
import { SiteHeader } from "@/components/site-header";
import {
  PUBLIC_PAGE_SEO,
  SITE_FAQS,
  faqPageJsonLd,
  publicPageMetadata,
} from "@/lib/seo";

export const metadata = publicPageMetadata(PUBLIC_PAGE_SEO.faq);

export default function FaqPage() {
  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f8fbf7_0%,#f4f7f3_50%,#f0ebe0_100%)]">
      <SiteHeader />
      <main className="mx-auto w-[min(44rem,calc(100%-2rem))] py-10">
        <p className="section-kicker">FAQ</p>
        <h1 className="display-title mt-2 text-4xl">HoneyMatcha FAQ</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          Short answers for people connecting Sage or their own assistant.
          For the full walkthrough, see{" "}
          <Link href="/how-to-connect-agents">how to connect agents</Link>.
        </p>
        <FaqList items={SITE_FAQS} heading="Answers" />
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          <Link href="/sign-up" className="button-primary w-full">
            Start with Sage
          </Link>
          <Link href="/agents" className="button-secondary w-full">
            Bring your own agent
          </Link>
        </div>
        <PublicFooter />
      </main>
      <JsonLd data={faqPageJsonLd(SITE_FAQS)} />
    </div>
  );
}
