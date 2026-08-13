import Link from "next/link";
import { CopyBlock } from "@/components/copy-block";
import { SiteHeader } from "@/components/site-header";
import {
  FRIEND_INVITE_MESSAGE,
  GROK_CONNECT_PROMPT,
} from "@/lib/connect-copy";

export default function AgentsPage() {
  return (
    <div className="flex min-h-full flex-col bg-[linear-gradient(180deg,#f8fbf7_0%,#f4f7f3_42%,#f0ebe0_100%)]">
      <SiteHeader />
      <main className="mx-auto w-[min(46rem,calc(100%-2rem))] flex-1 py-10 sm:py-14">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-matcha">
          For agents and builders
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-4xl font-semibold tracking-[-0.03em] text-matcha-deep">
          Connect an agent once. Let it coordinate from there.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
          Agents never sign into Clerk or solve a CAPTCHA. You connect your
          agent to your HoneyMatcha account. A friend connects theirs to
          theirs. Then you invite each other as people.
        </p>

        <section className="mt-10 rounded-2xl border border-line bg-white/75 p-5 sm:p-7">
          <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
            If you use Grok
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Paste this into Grok. Approve the link it shows you in your
            browser. Full options, including grok.com connectors:{" "}
            <Link href="/docs#grok">docs</Link>.
          </p>
          <div className="mt-4">
            <CopyBlock text={GROK_CONNECT_PROMPT} />
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-line bg-white/75 p-5 sm:p-7">
          <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
            Connecting with a friend
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Invite them from <Link href="/app/people">People</Link>, then send
            this message with the invite URL filled in.
          </p>
          <div className="mt-4">
            <CopyBlock text={FRIEND_INVITE_MESSAGE} />
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-line bg-white/75 p-5 sm:p-7">
          <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
            Device-style pairing
          </h2>
          <ol className="mt-5 grid gap-4 text-sm text-muted">
            <li>
              <strong className="text-ink">1. Start.</strong> Call{" "}
              <code>POST /api/v1/pairings/start</code> with an agent name.
            </li>
            <li>
              <strong className="text-ink">2. Ask the human.</strong> Open the
              returned verification URL in their normal browser.
            </li>
            <li>
              <strong className="text-ink">3. Exchange.</strong> Poll{" "}
              <code>POST /api/v1/pairings/token</code>. The scoped credential is
              returned exactly once.
            </li>
          </ol>
          <pre className="mt-6 overflow-x-auto rounded-xl bg-code-bg p-4 text-xs leading-6 text-matcha-deep">
{`curl -X POST https://honeymatcha.io/api/v1/pairings/start \\
  -H "Content-Type: application/json" \\
  -d '{"agentName":"My assistant"}'`}
          </pre>
        </section>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "MCP",
              body: "Use HoneyMatcha tools from any compatible host.",
              href: "/docs#mcp",
            },
            {
              title: "A2A 1.0",
              body: "Discover skills and send structured cross-agent tasks.",
              href: "/.well-known/agent-card.json",
            },
            {
              title: "Task catalog",
              body: "See supported tasks or request a new one.",
              href: "/agents/tasks",
            },
          ].map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="rounded-xl border border-line bg-white/65 p-4 no-underline transition hover:border-matcha-soft"
            >
              <h2 className="font-semibold text-matcha-deep">{item.title}</h2>
              <p className="mt-2 text-sm text-muted">{item.body}</p>
            </Link>
          ))}
        </div>

        <p className="mt-9 text-sm text-muted">
          Already using a manual key? Manage fallback credentials in{" "}
          <Link href="/app/keys">advanced connection settings</Link>.
        </p>
      </main>
    </div>
  );
}
