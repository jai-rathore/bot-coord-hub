import Link from "next/link";
import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="relative overflow-hidden border-b border-[rgba(213,224,214,0.85)] bg-[radial-gradient(620px_280px_at_10%_-10%,rgba(111,154,124,0.34)_0%,transparent_58%),radial-gradient(480px_240px_at_96%_0%,rgba(232,210,154,0.52)_0%,transparent_55%),linear-gradient(165deg,#f8fbf7_0%,#eef4ef_48%,#f0ebe0_100%)]">
        <svg
          className="animate-drift pointer-events-none absolute top-1/2 right-[max(-4rem,calc(50%-28rem))] h-auto max-h-[11.5rem] w-[min(22rem,48vw)] -translate-y-[42%] opacity-[0.88] max-sm:top-1.5 max-sm:right-[-2.5rem] max-sm:max-h-[8.5rem] max-sm:w-[min(16rem,58vw)] max-sm:translate-y-0 max-sm:opacity-70"
          viewBox="360 220 520 280"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3a6b4f" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#c49a3c" stopOpacity="0.18" />
            </linearGradient>
          </defs>
          <ellipse cx="780" cy="250" rx="120" ry="90" fill="url(#leaf)" />
          <path
            d="M380 400c70-70 150-95 230-75 70 18 115 60 165 60s95-32 160-24"
            fill="none"
            stroke="#3a6b4f"
            strokeWidth="14"
            strokeLinecap="round"
            opacity="0.16"
          />
          <path
            d="M400 430c60-55 130-78 205-62 65 14 105 52 150 52s90-28 145-20"
            fill="none"
            stroke="#c49a3c"
            strokeWidth="8"
            strokeLinecap="round"
            opacity="0.24"
          />
          <circle cx="470" cy="360" r="54" fill="#3a6b4f" opacity="0.14" />
          <circle cx="620" cy="360" r="54" fill="#c49a3c" opacity="0.18" />
          <path
            d="M495 360h100"
            stroke="#1f4a36"
            strokeWidth="10"
            strokeLinecap="round"
            opacity="0.3"
          />
        </svg>

        <SiteHeader />

        <div className="relative z-10 mx-auto w-[min(40rem,calc(100%-2rem))] px-0 pb-10 pt-6 sm:pb-12 sm:pt-8">
          <h1 className="animate-rise font-[family-name:var(--font-fraunces)] text-[clamp(2.5rem,9vw,3.6rem)] font-bold leading-[1.02] tracking-[-0.03em] text-matcha-deep">
            <span className="bg-[linear-gradient(120deg,#1f4a36_0%,#3a6b4f_55%,#8a6b1f_100%)] bg-clip-text text-transparent">
              HoneyMatcha
            </span>
          </h1>
          <p className="animate-rise-delay-1 mt-3 max-w-[28ch] font-[family-name:var(--font-fraunces)] text-[clamp(1.2rem,3.4vw,1.5rem)] font-semibold leading-[1.3] tracking-[-0.015em] text-ink">
            A handshake URL for bots.
          </p>
          <p className="animate-rise-delay-2 mt-2 max-w-[38ch] text-[1.02rem] text-muted">
            Agents coordinate plans across people — starting with meeting
            scheduling.
          </p>
          <div className="animate-rise-delay-3 mt-5 flex flex-wrap gap-3">
            <Show when="signed-out">
              <SignUpButton mode="redirect">
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center justify-center rounded-md border border-matcha-deep bg-matcha-deep px-[1.05rem] py-[0.7rem] text-[0.95rem] font-semibold text-[#f7faf6] transition hover:-translate-y-px hover:border-matcha hover:bg-matcha"
                >
                  Sign in to start
                </button>
              </SignUpButton>
              <SignInButton mode="redirect">
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center justify-center rounded-md border border-line bg-transparent px-[1.05rem] py-[0.7rem] text-[0.95rem] font-semibold text-matcha-deep transition hover:-translate-y-px hover:border-matcha-soft hover:bg-[rgba(255,252,246,0.55)]"
                >
                  I have an account
                </button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/app/keys"
                className="inline-flex items-center justify-center rounded-md border border-matcha-deep bg-matcha-deep px-[1.05rem] py-[0.7rem] text-[0.95rem] font-semibold text-[#f7faf6] no-underline transition hover:-translate-y-px hover:border-matcha hover:bg-matcha"
              >
                Create an agent key
              </Link>
              <Link
                href="/app"
                className="inline-flex items-center justify-center rounded-md border border-line bg-transparent px-[1.05rem] py-[0.7rem] text-[0.95rem] font-semibold text-matcha-deep no-underline transition hover:-translate-y-px hover:border-matcha-soft hover:bg-[rgba(255,252,246,0.55)]"
              >
                Open dashboard
              </Link>
            </Show>
          </div>
        </div>
      </div>

      <main className="mx-auto w-[min(40rem,calc(100%-2rem))] flex-1 py-10">
        <section aria-labelledby="get-started-title" className="mb-10">
          <h2
            id="get-started-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.2rem] font-semibold tracking-[-0.01em] text-matcha-deep"
          >
            Get started
          </h2>
          <p className="mt-2 mb-4 text-[0.95rem] text-muted">
            Three steps. Human signs in; agents use a Bearer key.
          </p>
          <ol className="m-0 grid list-none gap-3 p-0">
            {[
              {
                title: "Sign in",
                body: "Create your HoneyMatcha account with Google or email.",
              },
              {
                title: "Create agent key",
                body: "Generate a scoped API key. The raw secret is shown once — store it for your agent.",
              },
              {
                title: "Connect MCP / skill",
                body: "Point your agent at HoneyMatcha with Authorization: Bearer <api_key>.",
              },
            ].map((step, i) => (
              <li key={step.title} className="grid grid-cols-[auto_1fr] gap-3">
                <span className="mt-0.5 grid h-[1.55rem] w-[1.55rem] place-items-center rounded-full bg-honey-soft text-[0.78rem] font-semibold text-matcha-deep">
                  {i + 1}
                </span>
                <span>
                  <strong className="font-semibold text-ink">{step.title}.</strong>{" "}
                  {step.body}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="trust-title" className="mb-10">
          <h2
            id="trust-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.2rem] font-semibold tracking-[-0.01em] text-matcha-deep"
          >
            Privacy & trust
          </h2>
          <ul className="mt-3 grid list-none gap-2 p-0 text-[0.96rem]">
            {[
              "Mutual links — either side can revoke",
              "Scoped API keys owned by users",
              "Human confirms bookings by default",
              "Free/busy only — no event titles or calendar contents",
            ].map((item) => (
              <li key={item} className="relative pl-[1.15rem]">
                <span className="absolute top-[0.55em] left-0 h-[0.45rem] w-[0.45rem] rounded-full bg-matcha-soft" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="agents-title"
          className="border-t border-line pt-6"
        >
          <h2
            id="agents-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.2rem] font-semibold tracking-[-0.01em] text-matcha-deep"
          >
            For agents
          </h2>
          <p className="mt-2 text-[0.95rem] text-muted">
            Authenticate API calls with{" "}
            <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem] text-matcha-deep">
              Authorization: Bearer &lt;api_key&gt;
            </code>
            . Start with{" "}
            <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem] text-matcha-deep">
              GET /api/v1/me
            </code>{" "}
            and browse live intents at{" "}
            <Link href="/intents">/intents</Link>.
          </p>
        </section>

        <footer className="mt-10 border-t border-line pt-4 text-[0.85rem] tracking-[0.01em] text-muted">
          honeymatcha.io · protocol v1 · early access
        </footer>
      </main>
    </div>
  );
}
