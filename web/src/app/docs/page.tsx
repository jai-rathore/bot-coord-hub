import Link from "next/link";
import { CopyBlock } from "@/components/copy-block";
import { SiteHeader } from "@/components/site-header";
import {
  FRIEND_INVITE_MESSAGE,
  GROK_CONNECT_PROMPT,
  GROK_MCP_CLI,
} from "@/lib/connect-copy";

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
  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-[rgba(213,224,214,0.85)] bg-[radial-gradient(520px_220px_at_8%_-20%,rgba(111,154,124,0.28)_0%,transparent_55%),linear-gradient(165deg,#f8fbf7_0%,#eef4ef_55%,#f3efe6_100%)]">
        <SiteHeader />
        <div className="mx-auto w-[min(44rem,calc(100%-2rem))] px-0 pb-8 pt-4">
          <p className="text-sm font-medium tracking-[0.04em] text-matcha-soft uppercase">
            Docs
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-fraunces)] text-[clamp(1.9rem,5vw,2.6rem)] font-bold tracking-[-0.03em] text-matcha-deep">
            Connect an agent to HoneyMatcha
          </h1>
          <p className="mt-2 max-w-[42ch] text-[1.02rem] text-muted">
            You connect your agent to your HoneyMatcha account. A friend
            connects their agent to theirs. Then you invite each other as
            people — agents never sign into Clerk.
          </p>
        </div>
      </div>

      <main className="mx-auto w-[min(44rem,calc(100%-2rem))] flex-1 py-10">
        <section aria-labelledby="steps-title" className="mb-12">
          <h2
            id="steps-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.25rem] font-semibold text-matcha-deep"
          >
            Three steps
          </h2>
          <ol className="mt-4 grid list-none gap-4 p-0">
            {[
              {
                title: "Start a short-lived pairing",
                body: (
                  <>
                    Call{" "}
                    <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">
                      POST /api/v1/pairings/start
                    </code>{" "}
                    with the agent&apos;s name.
                  </>
                ),
              },
              {
                title: "Ask the human to approve",
                body: (
                  <>
                    Open the returned verification URL in their normal browser.
                    Agents never receive Clerk credentials or solve CAPTCHA.
                  </>
                ),
              },
              {
                title: "Exchange once and verify",
                body: (
                  <>
                    Poll <code>POST /api/v1/pairings/token</code>, store the
                    scoped <code>hm_</code> credential, then call{" "}
                    <code>whoami</code>.
                  </>
                ),
              },
            ].map((step, i) => (
              <li key={step.title} className="grid grid-cols-[auto_1fr] gap-3">
                <span className="mt-0.5 grid h-[1.55rem] w-[1.55rem] place-items-center rounded-full bg-honey-soft text-[0.78rem] font-semibold text-matcha-deep">
                  {i + 1}
                </span>
                <div>
                  <strong className="font-semibold text-ink">{step.title}</strong>
                  <p className="mt-1 text-[0.95rem] text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="grok-title" className="mb-12" id="grok">
          <h2
            id="grok-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.25rem] font-semibold text-matcha-deep"
          >
            If you use Grok
          </h2>
          <p className="mt-2 text-[0.95rem] leading-7 text-muted">
            Sign in at HoneyMatcha first, then connect Google Calendar in{" "}
            <Link href="/app/settings">Settings</Link>. After that, pick one
            path:
          </p>
          <ol className="mt-4 grid list-none gap-3 p-0 text-[0.95rem] text-muted">
            <li className="relative pl-[1.15rem]">
              <span className="absolute top-[0.55em] left-0 h-[0.45rem] w-[0.45rem] rounded-full bg-matcha-soft" />
              <strong className="font-semibold text-ink">
                Fastest for grok.com:
              </strong>{" "}
              create a key at <Link href="/app/keys">/app/keys</Link>, then add
              a custom MCP connector at{" "}
              <a href="https://grok.com/connectors">grok.com/connectors</a>{" "}
              with URL{" "}
              <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">
                https://honeymatcha.io/api/mcp
              </code>{" "}
              and the <code>hm_</code> key as the Bearer token.
            </li>
            <li className="relative pl-[1.15rem]">
              <span className="absolute top-[0.55em] left-0 h-[0.45rem] w-[0.45rem] rounded-full bg-matcha-soft" />
              <strong className="font-semibold text-ink">Grok CLI / Build:</strong>
            </li>
          </ol>
          <div className="mt-3">
            <CopyBlock text={GROK_MCP_CLI} />
          </div>
          <p className="mt-4 text-[0.95rem] leading-7 text-muted">
            Or paste this into Grok and let it start pairing. Approve the link
            it shows you in your normal browser.
          </p>
          <div className="mt-3">
            <CopyBlock text={GROK_CONNECT_PROMPT} />
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
            You do not connect their agent to yours. Each person connects their
            own agent to their own HoneyMatcha account. Then you invite the
            person from <Link href="/app/people">People</Link> and send them
            the private invite URL. HoneyMatcha does not email that link yet.
          </p>
          <p className="mt-3 text-[0.95rem] leading-7 text-muted">
            After they accept, ask your agent to schedule with their email. If
            they do not have an agent, send a one-task guest link instead of a
            People invite.
          </p>
          <div className="mt-4">
            <CopyBlock text={FRIEND_INVITE_MESSAGE} />
          </div>
        </section>

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
            Grok Bot skill
          </h2>
          <p className="mt-2 text-[0.95rem] text-muted">
            Prefer the Grok steps above. If you are wiring a custom Grok Bot,
            paste{" "}
            <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">
              skills/honeymatcha/SKILL.md
            </code>{" "}
            into it. The skill uses pairing rather than automating human
            sign-in. See{" "}
            <a href="#grok">If you use Grok</a>.
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
              Update your agent / MCP secrets (
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
              proposes times from free/busy, then opens a human approval. Mock
              bookings are refused in production. Supports{" "}
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
