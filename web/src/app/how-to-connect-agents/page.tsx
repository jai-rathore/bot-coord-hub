import Link from "next/link";
import { FaqList } from "@/components/faq-list";
import { JsonLd } from "@/components/json-ld";
import { PublicFooter } from "@/components/public-footer";
import { SiteHeader } from "@/components/site-header";
import {
  CONNECT_FAQS,
  HOW_TO_H1,
  HOW_TO_LEAD,
  HOW_TO_STEPS,
  PUBLIC_PAGE_SEO,
  faqPageJsonLd,
  howToJsonLd,
  organizationJsonLd,
  publicPageMetadata,
} from "@/lib/seo";

export const metadata = publicPageMetadata(PUBLIC_PAGE_SEO.howTo);

export default function HowToConnectAgentsPage() {
  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f8fbf7_0%,#f4f7f3_50%,#f0ebe0_100%)]">
      <SiteHeader />
      <main className="mx-auto w-[min(44rem,calc(100%-2rem))] py-10">
        <p className="text-base leading-7 text-ink">{HOW_TO_LEAD}</p>
        <h1 className="display-title mt-6 text-4xl">{HOW_TO_H1}</h1>

        <ol className="mt-8 grid list-none gap-5 p-0">
          {HOW_TO_STEPS.map((step, index) => (
            <li
              key={step.name}
              className="grid grid-cols-[auto_1fr] gap-3"
            >
              <span className="mt-0.5 grid h-[1.55rem] w-[1.55rem] place-items-center rounded-full bg-honey-soft text-[0.78rem] font-semibold text-matcha-deep">
                {index + 1}
              </span>
              <div>
                <h2 className="font-semibold text-ink">{step.name}</h2>
                <p className="mt-1 text-sm leading-7 text-muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <FaqList items={CONNECT_FAQS} />

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          <Link href="/sign-up" className="button-primary w-full">
            Start with Sage
          </Link>
          <Link href="/agents" className="button-secondary w-full">
            Bring your own agent
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted">
          Prefer a side-by-side setup?{" "}
          <Link href="/connect-chatgpt-and-claude">
            Connect ChatGPT and Claude
          </Link>
          .
        </p>
        <PublicFooter />
      </main>
      <JsonLd
        data={[howToJsonLd(), faqPageJsonLd(CONNECT_FAQS), organizationJsonLd()]}
      />
    </div>
  );
}
