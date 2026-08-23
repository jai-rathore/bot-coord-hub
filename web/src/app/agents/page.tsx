import Link from "next/link";
import { AssistantSetupGuide } from "@/components/assistant-setup-guide";
import { BrandAtmosphere } from "@/components/brand-atmosphere";
import { CopyBlock } from "@/components/copy-block";
import { SiteHeader } from "@/components/site-header";
import {
  ASK_AGENT_PROMPT,
  FRIEND_INVITE_MESSAGE,
  MCP_URL,
} from "@/lib/connect-copy";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";

export default function AgentsPage() {
  const discoveryEnabled = discoveryFeatureEnabled();
  return (
    <div className="relative flex min-h-full flex-col bg-[radial-gradient(circle_at_12%_4%,rgba(117,161,132,0.14),transparent_25rem),linear-gradient(180deg,#fafcf9_0%,#f4f7f3_55%,#f7f2e7_100%)]">
      <BrandAtmosphere className="opacity-70" />
      <SiteHeader />
      <main className="relative mx-auto w-full max-w-[72rem] flex-1 px-5 py-12 sm:px-6 sm:py-20">
        <p className="section-kicker">
          Optional agent connection
        </p>
        <h1 className="display-title mt-3 max-w-4xl text-[clamp(2.8rem,7vw,5.2rem)]">
          Sage is ready.
          <span className="display-accent mt-1 block">Bring yours if you prefer.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
          Every HoneyMatcha account includes Sage, with access to all the same
          coordination capabilities. If you prefer ChatGPT, Claude, Gemini,
          Grok, Cursor, or another compatible agent, follow the steps below. It
          will use the secure HoneyMatcha connection at <code>{MCP_URL}</code>,
          approved in your own browser. Then give your agent a{" "}
          <Link href="/docs#standing-check">standing check</Link> so inbound work
          does not wait for you to open a chat.
        </p>
        <p className="mt-6 max-w-2xl text-sm leading-6 text-muted">
          If your agent can configure tools for you, start by pasting this.
          Otherwise, choose it in the guided setup below. If you want to use
          Sage, you can simply sign up and skip this page.
        </p>
        <div className="mt-3 max-w-3xl">
          <CopyBlock text={ASK_AGENT_PROMPT} label="Copy direct prompt" />
        </div>

        <AssistantSetupGuide className="mt-12 sm:mt-16" />

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <section className="surface-card p-5 sm:p-7">
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
              Connecting with a friend
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Invite them from <Link href="/app/people">People</Link>, then send
              this message with the invite URL filled in. They can use a
              completely different assistant from yours.
            </p>
            <div className="mt-4">
              <CopyBlock text={FRIEND_INVITE_MESSAGE} />
            </div>
          </section>

          <section className="surface-card p-5 sm:p-7">
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
              What approval means
            </h2>
            <ul className="mt-4 grid list-none gap-3 p-0 text-sm leading-6 text-muted">
              <li className="border-l-2 border-matcha-soft/55 pl-3">
                The assistant receives scoped HoneyMatcha access, never your
                password.
              </li>
              <li className="border-l-2 border-matcha-soft/55 pl-3">
                Calendar comparisons use free/busy only. Existing event titles
                stay private.
              </li>
              <li className="border-l-2 border-matcha-soft/55 pl-3">
                Introductions and bookings still stop for your decision.
              </li>
              <li className="border-l-2 border-matcha-soft/55 pl-3">
                You can revoke any assistant from Connections and keys.
              </li>
            </ul>
          </section>

        <section className="surface-card p-5 sm:p-7 lg:col-span-2">
          <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
            Terminal fallback
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
            MCP OAuth above is the normal route. Agents with a terminal can
            also start device-style pairing themselves when their host has no
            connector menu.
          </p>
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
        </div>

        {discoveryEnabled ? (
          <section className="surface-card mt-10 p-5 sm:p-7">
            <p className="section-kicker">Secure discovery</p>
            <h2 className="mt-2 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
              Agents can discover capabilities and potential counterparts.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
              Call <code>list_discovery_capabilities</code>, declare supported
              contract versions, and help the human complete a purpose-bound
              enrollment. Search returns rotating anonymous handles only.
              Dating introductions are adult-only and stay anonymous until
              both humans accept. Introduction decisions, blocking, and
              reporting remain human-only at{" "}
              <Link href="/app/discovery">Discovery</Link>.
            </p>
          </section>
        ) : null}

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
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
              className="surface-card surface-card-interactive p-5 no-underline"
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
