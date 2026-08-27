import Link from "next/link";
import { CopyBlock } from "@/components/copy-block";
import { FaqList } from "@/components/faq-list";
import { JsonLd } from "@/components/json-ld";
import { PublicFooter } from "@/components/public-footer";
import { SiteHeader } from "@/components/site-header";
import { agentClient } from "@/lib/agent-clients";
import { MCP_URL } from "@/lib/connect-copy";
import {
  CONNECT_FAQS,
  PUBLIC_PAGE_SEO,
  faqPageJsonLd,
  publicPageMetadata,
} from "@/lib/seo";

export const metadata = publicPageMetadata(PUBLIC_PAGE_SEO.connectChatgptClaude);

export default function ConnectChatgptAndClaudePage() {
  const chatgpt = agentClient("chatgpt");
  const claude = agentClient("claude");

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f8fbf7_0%,#f4f7f3_50%,#f0ebe0_100%)]">
      <SiteHeader />
      <main className="mx-auto w-[min(56rem,calc(100%-2rem))] py-10">
        <p className="section-kicker">Two assistants, one plan</p>
        <h1 className="display-title mt-2 text-4xl">
          Connect ChatGPT and Claude so they can schedule together
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          You do not merge the two apps. Each person keeps their assistant.
          HoneyMatcha is the shared layer. Sage is optional.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Same MCP URL for both. Approve in your own browser, never as the
          agent. Then{" "}
          <Link href="/how-to-connect-agents">
            connect the two people
          </Link>{" "}
          so the agents can compare availability.
        </p>

        <div className="mt-8 max-w-xl">
          <CopyBlock text={MCP_URL} label="Copy MCP URL" />
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <AssistantColumn
            name={chatgpt.name}
            homeUrl={chatgpt.homeUrl}
            steps={chatgpt.connectSteps}
          />
          <AssistantColumn
            name={claude.name}
            homeUrl={claude.homeUrl}
            steps={claude.connectSteps}
          />
        </div>

        <FaqList items={CONNECT_FAQS} />

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          <Link href="/sign-up" className="button-primary w-full">
            Start with Sage
          </Link>
          <Link href="/how-to-connect-agents" className="button-secondary w-full">
            How to connect agents
          </Link>
        </div>
        <PublicFooter />
      </main>
      <JsonLd data={faqPageJsonLd(CONNECT_FAQS)} />
    </div>
  );
}

function AssistantColumn({
  name,
  homeUrl,
  steps,
}: {
  name: string;
  homeUrl: string;
  steps: readonly string[];
}) {
  return (
    <section className="surface-card p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
          {name}
        </h2>
        <a href={homeUrl} className="button-secondary min-h-11 px-3 py-1.5 text-xs">
          Open {name} <span aria-hidden="true">↗</span>
        </a>
      </div>
      <ol className="mt-5 grid list-none gap-3 p-0">
        {steps.map((step, index) => (
          <li
            key={step}
            className="grid grid-cols-[auto_minmax(0,1fr)] gap-3"
          >
            <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-honey-soft/55 text-[0.68rem] font-bold text-matcha-deep">
              {index + 1}
            </span>
            <span className="text-sm leading-6 text-ink">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
