import Link from "next/link";
import { BrandAtmosphere } from "@/components/brand-atmosphere";
import { CopyBlock } from "@/components/copy-block";
import { SiteHeader } from "@/components/site-header";
import {
  ASK_AGENT_PROMPT,
  FRIEND_INVITE_MESSAGE,
  GROK_BOT_URL,
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
          For agents and builders
        </p>
        <h1 className="display-title mt-3 max-w-4xl text-[clamp(2.8rem,7vw,5.2rem)]">
          Connect Grok Bot.
          <span className="display-accent mt-1 block">Authorize once.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
          Open <a href={GROK_BOT_URL}>Grok Bot at x.ai/bot</a>, add HoneyMatcha
          under <strong>Plugins</strong> (or the custom MCP URL{" "}
          <code>https://honeymatcha.io/api/mcp</code>), and Authorize in your
          browser. Paste the pairing prompt below only if Plugins OAuth is
          unavailable.
        </p>
        <div className="mt-6 max-w-3xl">
          <CopyBlock text={ASK_AGENT_PROMPT} />
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
        <section className="surface-card surface-card-interactive p-5 sm:p-7">
          <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
            New to Grok Bot?
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Grok Bot is an AI teammate with its own persistent cloud computer,
            browser, and terminal. Download it from{" "}
            <a href={GROK_BOT_URL}>x.ai/bot</a>, then follow the{" "}
            <Link href="/docs#grok-bot">HoneyMatcha setup guide</Link>.
          </p>
        </section>

        <section className="surface-card surface-card-interactive p-5 sm:p-7">
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

        <section className="surface-card p-5 sm:p-7 lg:col-span-3">
          <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
            Preferred: Plugins Authorize
          </h2>
          <ol className="mt-5 grid gap-4 text-sm text-muted">
            <li>
              <strong className="text-ink">1. Plugins.</strong> In Grok Bot open{" "}
              <strong>Plugins</strong> and add HoneyMatcha, or paste{" "}
              <code>https://honeymatcha.io/api/mcp</code> as a custom MCP URL.
            </li>
            <li>
              <strong className="text-ink">2. Authorize.</strong> Sign in to
              HoneyMatcha in your browser. The agent never gets your password.
            </li>
            <li>
              <strong className="text-ink">3. Use it.</strong> Type{" "}
              <code>@HoneyMatcha</code> (or let tools run automatically) and
              connect Google Calendar under Settings when you need booking.
            </li>
          </ol>
          <h3 className="mt-8 font-semibold text-matcha-deep">
            Fallback: device-style pairing
          </h3>
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
