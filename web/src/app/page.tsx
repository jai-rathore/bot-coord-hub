import Link from "next/link";
import { AmbientField } from "@/components/ambient-field";
import { HomeGetStarted } from "@/components/home-get-started";
import { HomeHero } from "@/components/home-hero";
import { SiteHeader } from "@/components/site-header";

const TRUST = [
  {
    title: "Set preferences once",
    body: "Hours, people, and how far your agent can go.",
  },
  {
    title: "Ask only when needed",
    body: "Your agent handles the back-and-forth first.",
  },
  {
    title: "You keep the last word",
    body: "Important actions wait for your say.",
  },
  {
    title: "See every step",
    body: "A clear trail of what your agent did.",
  },
  {
    title: "Calendars stay private",
    body: "Only free/busy is compared — never event details.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <div className="relative hm-atmosphere">
        <AmbientField />
        <HomeHero />
      </div>

      <main className="mx-auto w-[min(72rem,calc(100%-2rem))] flex-1 py-12 sm:py-16">
        <HomeGetStarted />

        <section aria-labelledby="trust-title" className="mt-6 sm:mt-10">
          <h2
            id="trust-title"
            className="font-[family-name:var(--font-fraunces)] text-[clamp(1.4rem,3vw,1.85rem)] font-semibold tracking-[-0.02em] text-matcha-deep"
          >
            You stay in control
          </h2>
          <ul className="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-5">
            {TRUST.map((item) => (
              <li
                key={item.title}
                className="hm-card rounded-2xl border border-line bg-white/70 p-4"
              >
                <p className="font-semibold text-matcha-deep">{item.title}</p>
                <p className="mt-1.5 text-sm leading-6 text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[0.85rem] text-muted">
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
