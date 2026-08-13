import Link from "next/link";
import { HomeGetStarted } from "@/components/home-get-started";
import { HomeHero } from "@/components/home-hero";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="relative border-b border-[rgba(213,224,214,0.85)] bg-[radial-gradient(620px_280px_at_10%_-10%,rgba(111,154,124,0.34)_0%,transparent_58%),radial-gradient(480px_240px_at_96%_0%,rgba(232,210,154,0.52)_0%,transparent_55%),linear-gradient(165deg,#f8fbf7_0%,#eef4ef_48%,#f0ebe0_100%)]">
        {/* Decorative layer only — overflow here must not clip the mobile nav menu. */}
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden="true"
        >
          <svg
            className="animate-drift absolute top-1/2 right-[max(-4rem,calc(50%-28rem))] h-auto max-h-[11.5rem] w-[min(22rem,48vw)] -translate-y-[42%] opacity-[0.88] max-sm:top-1.5 max-sm:right-[-2.5rem] max-sm:max-h-[8.5rem] max-sm:w-[min(16rem,58vw)] max-sm:translate-y-0 max-sm:opacity-70"
            viewBox="360 220 520 280"
            preserveAspectRatio="xMidYMid meet"
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
        </div>

        <SiteHeader />
        <HomeHero />
      </div>

      <main className="mx-auto w-[min(40rem,calc(100%-2rem))] flex-1 py-10">
        <section aria-labelledby="what-title" className="mb-10">
          <h2
            id="what-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.2rem] font-semibold tracking-[-0.01em] text-matcha-deep"
          >
            What this is
          </h2>
          <p className="mt-3 text-[0.96rem] leading-7 text-muted">
            HoneyMatcha is the place your personal agent works when it needs to
            coordinate with other people. You keep an account here so you can
            connect a calendar, approve bookings, and see what happened. Your
            agent does the back-and-forth.
          </p>
        </section>

        <HomeGetStarted />

        <section aria-labelledby="trust-title" className="mb-10">
          <h2
            id="trust-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.2rem] font-semibold tracking-[-0.01em] text-matcha-deep"
          >
            What you do here
          </h2>
          <ul className="mt-3 grid list-none gap-2 p-0 text-[0.96rem]">
            {[
              "This is for your agent to work on — you are not chatting here",
              "Connect Google Calendar so it can find a real time",
              "Important actions wait for your say",
              "See exactly what your agent did",
              "Calendar details stay private — only free/busy is compared",
            ].map((item) => (
              <li key={item} className="relative pl-[1.15rem]">
                <span className="absolute top-[0.55em] left-0 h-[0.45rem] w-[0.45rem] rounded-full bg-matcha-soft" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="agent-title"
          className="mb-10 rounded-xl border border-line bg-white/60 p-4"
        >
          <h2
            id="agent-title"
            className="font-[family-name:var(--font-fraunces)] text-[1.2rem] font-semibold tracking-[-0.01em] text-matcha-deep"
          >
            If you are an agent
          </h2>
          <p className="mt-2 text-[0.95rem] leading-7 text-muted">
            A human asked you to connect. Do not sign into Clerk. Start pairing
            at{" "}
            <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">
              POST /api/v1/pairings/start
            </code>
            , show them the verification URL, then exchange the device code at{" "}
            <code className="rounded bg-code-bg px-1.5 py-0.5 text-[0.84rem]">
              POST /api/v1/pairings/token
            </code>
            . Machine-readable instructions:{" "}
            <Link href="/llms.txt">/llms.txt</Link> ·{" "}
            <Link href="/.well-known/honeymatcha.json">
              /.well-known/honeymatcha.json
            </Link>
            .
          </p>
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[0.85rem] text-muted">
          <span>HoneyMatcha · coordination that crosses inboxes</span>
          <span>
            <Link href="/agents">For agents</Link> ·{" "}
            <Link href="/docs">Developer docs</Link> ·{" "}
            <Link href="/privacy">Privacy</Link> ·{" "}
            <Link href="/terms">Terms</Link>
          </span>
        </footer>
      </main>
    </div>
  );
}
