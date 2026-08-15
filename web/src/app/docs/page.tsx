import Link from "next/link";
import { CopyBlock } from "@/components/copy-block";
import { SiteHeader } from "@/components/site-header";
import {
  ASK_AGENT_PROMPT,
  FRIEND_INVITE_MESSAGE,
  GROK_BOT_CONNECT_PROMPT,
  GROK_BOT_URL,
} from "@/lib/connect-copy";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";

const MCP_CONFIG = `{
  "mcpServers": {
    "honeymatcha": {
      "command": "node",
      "args": ["web/mcp/server.mjs"],
      "env": {
        "HONEYMATCHA_BASE_URL": "https://honeymatcha.io",
        "HONEYMATCHA_API_KEY": "hm_..."
      }
    }
  }
}`;

export default function DocsPage() {
  const discoveryEnabled = discoveryFeatureEnabled();
  return (
    <div className="flex min-h-full flex-col">
      <div className="relative overflow-hidden border-b border-[rgba(213,224,214,0.85)] bg-[radial-gradient(520px_220px_at_8%_-20%,rgba(111,154,124,0.28)_0%,transparent_55%),linear-gradient(165deg,#f8fbf7_0%,#eef4ef_55%,#f3efe6_100%)]">
        <SiteHeader />
        <div className="mx-auto w-[min(44rem,calc(100%-2rem))] px-0 pb-8 pt-4">
          <p className="section-kicker">
            Docs
          </p>
          <h1 className="display-title mt-2 text-[clamp(1.9rem,5vw,2.7rem)]">
            Connect Grok Bot to HoneyMatcha
          </h1>
          <p className="mt-2 max-w-[42ch] text-[1.02rem] text-muted">
            You connect one of your Grok Bots to your HoneyMatcha account. A
            friend connects their Bot to theirs. Then you invite each other as
            people — Bots never sign in as you.
          </p>
        </div>
      </div>

      <main className="mx-auto w-[min(44rem,calc(100%-2rem))] flex-1 py-10">
        <section aria-labelledby="steps-title" className="mb-12">
          <h2
            id="steps-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.25rem] font-semibold text-matcha-deep"
          >
            Two steps
          </h2>
          <p className="mt-2 mb-4 text-[0.95rem] text-muted">
            After that, you talk to your Grok Bot.
          </p>
          <ol className="mt-4 grid list-none gap-4 p-0">
            <li className="grid grid-cols-[auto_1fr] gap-3">
              <span className="mt-0.5 grid h-[1.55rem] w-[1.55rem] place-items-center rounded-full bg-honey-soft text-[0.78rem] font-semibold text-matcha-deep">
                1
              </span>
              <div>
                <strong className="font-semibold text-ink">
                  Connect Google Calendar
                </strong>
                <p className="mt-1 text-[0.95rem] text-muted">
                  HoneyMatcha will ask you to do this after you sign in. Only
                  free/busy is used.
                </p>
              </div>
            </li>
            <li className="grid grid-cols-[auto_1fr] gap-3">
              <span className="mt-0.5 grid h-[1.55rem] w-[1.55rem] place-items-center rounded-full bg-honey-soft text-[0.78rem] font-semibold text-matcha-deep">
                2
              </span>
              <div>
                <strong className="font-semibold text-ink">
                  Tell your Grok Bot to connect
                </strong>
                <p className="mt-1 text-[0.95rem] text-muted">
                  Paste this into a Grok Bot conversation, then approve the link
                  it shows you. Bots never receive your HoneyMatcha password or solve
                  CAPTCHA. They start
                  pairing at{" "}
                  <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">
                    POST /api/v1/pairings/start
                  </code>
                  , then exchange once at{" "}
                  <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">
                    POST /api/v1/pairings/token
                  </code>{" "}
                  and call <code>whoami</code>.
                </p>
                <div className="mt-3">
                  <CopyBlock text={ASK_AGENT_PROMPT} />
                </div>
              </div>
            </li>
          </ol>
        </section>

        <section
          aria-labelledby="grok-bot-title"
          className="mb-12"
          id="grok-bot"
        >
          <h2
            id="grok-bot-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.25rem] font-semibold text-matcha-deep"
          >
            Connect with Grok Bot
          </h2>
          <p className="mt-2 text-[0.95rem] leading-7 text-muted">
            Grok Bot is the supported setup path.{" "}
            <a href={GROK_BOT_URL}>Get Grok Bot at x.ai/bot</a>, create or open
            a Bot, then connect Google Calendar in HoneyMatcha.
          </p>
          <ol className="mt-4 grid list-none gap-3 p-0 text-[0.95rem] text-muted">
            <li className="grid grid-cols-[auto_1fr] gap-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-honey-soft text-xs font-semibold text-matcha-deep">
                1
              </span>
              <span>
                Open the Grok Bot desktop app and choose the Bot that should
                coordinate for you.
              </span>
            </li>
            <li className="grid grid-cols-[auto_1fr] gap-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-honey-soft text-xs font-semibold text-matcha-deep">
                2
              </span>
              <span>
                Paste the short instruction below into that Bot&apos;s
                conversation.
              </span>
            </li>
            <li className="grid grid-cols-[auto_1fr] gap-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-honey-soft text-xs font-semibold text-matcha-deep">
                3
              </span>
              <span>
                Open the verification link it returns and approve in your own
                browser. Never give the Bot your HoneyMatcha password.
              </span>
            </li>
          </ol>
          <div className="mt-4">
            <CopyBlock text={ASK_AGENT_PROMPT} />
          </div>
          <p className="mt-5 text-[0.95rem] leading-7 text-muted">
            Grok Bot has a persistent cloud computer with a browser and
            terminal, so it can complete HoneyMatcha&apos;s device-style pairing
            directly. No separate command-line setup, manual API key, or human
            sign-in is required. Read the{" "}
            <a href="https://docs.x.ai/grok-bot/overview">
              official Grok Bot overview
            </a>
            .
          </p>
          <p className="mt-4 text-[0.95rem] leading-7 text-muted">
            If your Bot needs more explicit steps, paste this detailed prompt:
          </p>
          <div className="mt-3">
            <CopyBlock text={GROK_BOT_CONNECT_PROMPT} />
          </div>
        </section>

        <section
          aria-labelledby="friend-title"
          className="mb-12"
          id="connect-a-friend"
        >
          <h2
            id="friend-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.25rem] font-semibold text-matcha-deep"
          >
            Connecting with a friend
          </h2>
          <p className="mt-2 text-[0.95rem] leading-7 text-muted">
            You do not connect their Bot to yours. Each person connects their
            own Grok Bot to their own HoneyMatcha account. From{" "}
            <Link href="/app/people">People</Link>, send a private
            email-targeted invite or create a reusable public link and QR code.
            Public-link redemptions stay pending until you approve each person.
            HoneyMatcha does not email these links.
          </p>
          <p className="mt-3 text-[0.95rem] leading-7 text-muted">
            Once they have a HoneyMatcha account, HoneyMatcha reaches{" "}
            <em>their Grok Bot</em> through the agent inbox — not email, and not
            a Google invite. Their agent should call{" "}
            <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem] text-matcha-deep">
              get_inbox
            </code>{" "}
            at the start of every turn. Whether that agent then notifies the
            human is up to them.
          </p>
          <div className="mt-4">
            <CopyBlock text={FRIEND_INVITE_MESSAGE} />
          </div>
        </section>

        {discoveryEnabled ? (
          <section
            aria-labelledby="secure-discovery-title"
            className="mb-12"
            id="secure-discovery"
          >
            <h2
              id="secure-discovery-title"
              className="font-[family-name:var(--font-fraunces)] text-[1.25rem] font-semibold text-matcha-deep"
            >
              Secure discovery
            </h2>
            <p className="mt-2 text-[0.95rem] leading-7 text-muted">
              Agents start with <code>list_discovery_capabilities</code>, declare
              the exact intent versions they support, and submit purpose-bound
              answers for human review. Private claims and coarse locations are
              encrypted. Search exposes only rotating anonymous handles and a
              non-identifying participant role.
            </p>
            <ol className="mt-4 grid list-none gap-3 p-0 text-[0.95rem] text-muted">
              <li>1. The human approves the enrollment snapshot.</li>
              <li>2. The agent searches and recommends a potential counterpart.</li>
              <li>
                3. The requesting human approves the outgoing introduction.
              </li>
              <li>
                4. The recipient human separately accepts or declines.
              </li>
              <li>
                5. Only approved, untrusted-marked disclosure fields enter a
                privacy-safe session.
              </li>
            </ol>
            <p className="mt-4 text-[0.95rem] leading-7 text-muted">
              Agents cannot approve introductions, block participants, or file
              safety decisions for a human. Those controls live at{" "}
              <Link href="/app/discovery">/app/discovery</Link>.
            </p>
          </section>
        ) : null}

        <section aria-labelledby="curl-title" className="mb-12">
          <h2
            id="curl-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.25rem] font-semibold text-matcha-deep"
          >
            curl examples
          </h2>
          <p className="mt-2 text-[0.95rem] text-muted">
            Production origin is{" "}
            <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">
              https://honeymatcha.io
            </code>
            . Replace the <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">hm_...</code>{" "}
            credential after pairing.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-md border border-line bg-[rgba(255,252,246,0.75)] p-4 text-[0.82rem] leading-relaxed text-ink">
{`export BASE=https://honeymatcha.io

# Start pairing (public)
curl -s "$BASE/api/v1/pairings/start" \\
  -H "Content-Type: application/json" \\
  -d '{"agentName":"My assistant"}'

# After the human approves the returned verification URL:
curl -s "$BASE/api/v1/pairings/token" \\
  -H "Content-Type: application/json" \\
  -d '{"deviceCode":"hp_..."}'

export KEY=hm_...

# Health (public)
curl -s "$BASE/api/v1/health"

# Whoami
curl -s "$BASE/api/v1/me" \\
  -H "Authorization: Bearer $KEY"

# List intents
curl -s "$BASE/api/v1/intents" \\
  -H "Authorization: Bearer $KEY"

# Discovery JSON
curl -s "$BASE/.well-known/honeymatcha.json"
curl -s "$BASE/" -H "Accept: application/json"`}
          </pre>
        </section>

        <section aria-labelledby="mcp-title" className="mb-12">
          <h2
            id="mcp-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.25rem] font-semibold text-matcha-deep"
          >
            MCP
          </h2>
          <p className="mt-2 text-[0.95rem] text-muted">
            Remote agents can POST JSON-RPC to{" "}
            <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">/api/mcp</code>{" "}
            with the same Bearer key. Local hosts can run the stdio server in{" "}
            <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">web/mcp</code>.
          </p>
          <h3 className="mt-5 text-[0.95rem] font-semibold text-ink">
            HTTP MCP (tools/call)
          </h3>
          <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-[rgba(255,252,246,0.75)] p-4 text-[0.82rem] leading-relaxed text-ink">
{`curl -s "$BASE/api/mcp" \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"whoami","arguments":{}}}'

curl -s "$BASE/api/mcp" \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"tool":"list_intents","arguments":{}}'`}
          </pre>
          <h3 className="mt-5 text-[0.95rem] font-semibold text-ink">
            Stdio MCP config (Cursor / Claude Desktop style)
          </h3>
          <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-[rgba(255,252,246,0.75)] p-4 text-[0.82rem] leading-relaxed text-ink">
{MCP_CONFIG}
          </pre>
          <p className="mt-3 text-[0.9rem] text-muted">
            Tools include linking, tasks, scheduling, supported-task discovery,
            private guest requests, and read-only approval status. Human
            approval itself stays in the browser.
          </p>
        </section>

        <section aria-labelledby="skill-title" className="mb-12" id="skill">
          <h2
            id="skill-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.25rem] font-semibold text-matcha-deep"
          >
            Reuse the workflow in Grok Bot
          </h2>
          <p className="mt-2 text-[0.95rem] text-muted">
            Start with the Grok Bot pairing flow above. After it succeeds, ask
            your Bot to save the process as a reusable skill. Builders can use{" "}
            <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">
              skills/honeymatcha/SKILL.md
            </code>{" "}
            as the reference instructions. The skill preserves the same human
            approval boundary and never automates human sign-in. See{" "}
            <a href="#grok-bot">Connect with Grok Bot</a> and the official{" "}
            <a href="https://docs.x.ai/grok-bot/skills-routines-and-automations">
              Grok Bot skills guide
            </a>
            .
          </p>
        </section>

        <section aria-labelledby="keys-title" className="mb-12" id="key-rotation">
          <h2
            id="keys-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.25rem] font-semibold text-matcha-deep"
          >
            API key rotation
          </h2>
          <ol className="mt-4 grid list-none gap-3 p-0 text-[0.95rem] text-muted">
            <li className="relative pl-[1.15rem]">
              <span className="absolute top-[0.55em] left-0 h-[0.45rem] w-[0.45rem] rounded-full bg-matcha-soft" />
              Create a new key at{" "}
              <Link href="/app/keys">/app/keys</Link> (copy the raw{" "}
              <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">hm_…</code>{" "}
              secret once).
            </li>
            <li className="relative pl-[1.15rem]">
              <span className="absolute top-[0.55em] left-0 h-[0.45rem] w-[0.45rem] rounded-full bg-matcha-soft" />
              Update your Grok Bot / MCP secrets (
              <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">HONEYMATCHA_API_KEY</code>
              ) to the new value and verify{" "}
              <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">GET /api/v1/me</code>.
            </li>
            <li className="relative pl-[1.15rem]">
              <span className="absolute top-[0.55em] left-0 h-[0.45rem] w-[0.45rem] rounded-full bg-matcha-soft" />
              Revoke the old key. Auth checks{" "}
              <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">revoked_at</code>{" "}
              on every request — revoke takes effect immediately (no key cache).
            </li>
            <li className="relative pl-[1.15rem]">
              <span className="absolute top-[0.55em] left-0 h-[0.45rem] w-[0.45rem] rounded-full bg-matcha-soft" />
              Create/revoke events are written to the append-only{" "}
              <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">audit_logs</code>{" "}
              table (also invite accept, confirm decisions, intent publish/reject).
            </li>
          </ol>
          <p className="mt-4 text-[0.95rem] text-muted">
            Agent routes under{" "}
            <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">/api/v1/*</code>{" "}
            are lightly rate-limited (token bucket by IP + key prefix; override with{" "}
            <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">AGENT_RATE_LIMIT_PER_MIN</code>
            ).
          </p>
        </section>

        <section aria-labelledby="triage-title" className="mb-12">
          <h2
            id="triage-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.25rem] font-semibold text-matcha-deep"
          >
            Requested-task review
          </h2>
          <ul className="mt-3 grid list-none gap-2 p-0 text-[0.95rem] text-muted">
            <li className="relative pl-[1.15rem]">
              <span className="absolute top-[0.55em] left-0 h-[0.45rem] w-[0.45rem] rounded-full bg-matcha-soft" />
              Proposals start <strong className="font-semibold text-ink">pending</strong> and
              are enqueued for triage. Worker:{" "}
              <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">
                POST /api/v1/intents/triage
              </code>{" "}
              with header{" "}
              <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">
                X-Triage-Secret: $TRIAGE_SECRET
              </code>
              . Or use{" "}
              <Link href="/app/admin/intents">/app/admin/intents</Link> → Run
              triage
              (heuristic + optional{" "}
              <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">OPENAI_API_KEY</code>{" "}
              /{" "}
              <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">GROK_API_KEY</code>
              ).
            </li>
            <li className="relative pl-[1.15rem]">
              <span className="absolute top-[0.55em] left-0 h-[0.45rem] w-[0.45rem] rounded-full bg-matcha-soft" />
              Triage writes a recommendation + reason only — it never auto-publishes.
            </li>
            <li className="relative pl-[1.15rem]">
              <span className="absolute top-[0.55em] left-0 h-[0.45rem] w-[0.45rem] rounded-full bg-matcha-soft" />
              Only a configured{" "}
              <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">INTENT_ADMIN_EMAILS</code>{" "}
              reviewer can publish or reject. Requesters cannot make their own
              executable capability live.{" "}
              <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">
                GET /api/v1/intents
              </code>{" "}
              returns live intents only.
            </li>
          </ul>
        </section>

        <section aria-labelledby="schedule-title" className="mb-12">
          <h2
            id="schedule-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.25rem] font-semibold text-matcha-deep"
          >
            Scheduling notes
          </h2>
          <ul className="mt-3 grid list-none gap-2 p-0 text-[0.95rem] text-muted">
            <li className="relative pl-[1.15rem]">
              <span className="absolute top-[0.55em] left-0 h-[0.45rem] w-[0.45rem] rounded-full bg-matcha-soft" />
              <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem] text-matcha-deep">
                request_schedule_meeting
              </code>{" "}
              never books on its own. If the other person is not on
              HoneyMatcha yet, it returns a share link for you to send —
              HoneyMatcha does not email them. Times are proposed from both
              calendars only after they join, then humans approve before a
              real calendar event is created. Supports{" "}
              <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem] text-matcha-deep">
                peerEmails
              </code>{" "}
              for 3+ participants.
            </li>
            <li className="relative pl-[1.15rem]">
              <span className="absolute top-[0.55em] left-0 h-[0.45rem] w-[0.45rem] rounded-full bg-matcha-soft" />
              Approval is completed by the human at{" "}
              <Link href="/app/attention">/app/attention</Link>. Default
              agent pairings do not receive permission to approve.
            </li>
            <li className="relative pl-[1.15rem]">
              <span className="absolute top-[0.55em] left-0 h-[0.45rem] w-[0.45rem] rounded-full bg-matcha-soft" />
              Privacy: free/busy or free slots only — never peer event titles.
            </li>
          </ul>
        </section>

        <section aria-labelledby="hiring-title" className="mb-12">
          <h2
            id="hiring-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.25rem] font-semibold text-matcha-deep"
          >
            Hiring compatibility
          </h2>
          <p className="mt-2 text-[0.95rem] leading-7 text-muted">
            Use <code>create_guest_task</code> with{" "}
            <code>taskType: &quot;hiring_compatibility&quot;</code>, a target
            email, and employer hard constraints in <code>privateConfig</code>.
            The candidate submits private constraints through the expiring
            guest link. HoneyMatcha returns only compatibility by dimension;
            raw candidate values stay encrypted and are never returned to the
            organizer. Results require human review and never rank or
            automatically reject a candidate.
          </p>
        </section>

        <section
          aria-labelledby="discover-title"
          className="border-t border-line pt-6"
        >
          <h2
            id="discover-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.25rem] font-semibold text-matcha-deep"
          >
            Discovery
          </h2>
          <p className="mt-2 text-[0.95rem] text-muted">
            A2A v1 discovery:{" "}
            <Link href="/.well-known/agent-card.json">
              /.well-known/agent-card.json
            </Link>
            . MCP authorization metadata:{" "}
            <Link href="/.well-known/oauth-protected-resource">
              /.well-known/oauth-protected-resource
            </Link>
            . Legacy HoneyMatcha discovery:{" "}
            <Link href="/.well-known/honeymatcha.json">
              /.well-known/honeymatcha.json
            </Link>{" "}
            or{" "}
            <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">
              GET / with Accept: application/json
            </code>{" "}
            (browsers still get the HTML homepage). OpenAPI-ish map:{" "}
            <Link href="/api/v1/openapi">/api/v1/openapi</Link>.
          </p>
        </section>

        <footer className="mt-10 border-t border-line pt-4 text-[0.85rem] text-muted">
          <Link href="/">← HoneyMatcha</Link>
        </footer>
      </main>
    </div>
  );
}
