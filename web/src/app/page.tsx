import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { BrandAtmosphere } from "@/components/brand-atmosphere";
import { HomeGetStarted } from "@/components/home-get-started";
import { HomeHero } from "@/components/home-hero";
import { SiteHeader } from "@/components/site-header";
import { getHomeStatus, isSetupComplete } from "@/lib/home-status";
import { ensureCurrentUser } from "@/lib/users";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";

export const dynamic = "force-dynamic";

const JOBS = [
  [
    "Schedule a meeting",
    "Your Bot compares free/busy time, finds a slot, and waits for you before anything is booked.",
  ],
  [
    "Invite someone in",
    "Send a private email invite, or share an approval-gated public link and QR from People.",
  ],
  [
    "Hand off one task",
    "A guest can finish a single request from an expiring link — no account, no network access.",
  ],
  [
    "Stay in the loop",
    "Watch it unfold, then step in only when a booking or sensitive action needs your say.",
  ],
] as const;

const TRUST = [
  {
    icon: "✦",
    title: "Your Grok Bot does the running around",
    body: "You don’t manage another chat inbox. Your Bot coordinates directly with the people and Bots involved.",
  },
  {
    icon: "✓",
    title: "You approve what matters",
    body: "Bookings and sensitive actions pause for your review. Agent credentials can never approve on your behalf.",
  },
  {
    icon: "◌",
    title: "Privacy by default",
    body: "Scheduling compares free and busy time only. Calendar names, titles, and private details stay private.",
  },
] as const;

async function loadSignedInHome(): Promise<{
  firstName: string | null;
  setupComplete: boolean;
} | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;
  const firstName = clerkUser.firstName?.trim() || null;
  try {
    const user = await ensureCurrentUser();
    if (!user) return { firstName, setupComplete: false };
    const status = await getHomeStatus(user);
    return { firstName, setupComplete: isSetupComplete(status) };
  } catch {
    // Don't nag a signed-in person about setup if status cannot be loaded.
    return { firstName, setupComplete: true };
  }
}

export default async function HomePage() {
  const signedInHome = await loadSignedInHome();
  const signedIn = Boolean(signedInHome);
  const setupComplete = signedInHome?.setupComplete ?? false;
  const discoveryEnabled = discoveryFeatureEnabled();

  return (
    <div className="flex min-h-full flex-col">
      <div className="relative border-b border-line/80 bg-[linear-gradient(150deg,rgba(250,252,249,0.98)_0%,rgba(237,244,238,0.96)_52%,rgba(249,242,223,0.92)_100%)]">
        <BrandAtmosphere />
        <SiteHeader showHowToStart={!setupComplete} />
        <HomeHero
          signedIn={signedIn}
          setupComplete={setupComplete}
          firstName={signedInHome?.firstName ?? null}
        />
        <div
          className="relative z-0 overflow-hidden border-t border-white/50 bg-white/35 py-3 backdrop-blur-sm"
          aria-hidden="true"
        >
          <div className="animate-marquee flex w-max gap-10 px-6 text-[0.72rem] font-semibold tracking-[0.14em] text-matcha uppercase">
            {[
              "Schedule from free/busy",
              "Invite by email or QR",
              "One-task guest links",
              "Human approval",
              "MCP and A2A",
              ...(discoveryEnabled
                ? ["Private recruiting", "Dating introductions"]
                : []),
              "Schedule from free/busy",
              "Invite by email or QR",
              "One-task guest links",
              "Human approval",
              "MCP and A2A",
              ...(discoveryEnabled
                ? ["Private recruiting", "Dating introductions"]
                : []),
            ].map((item, index) => (
              <span key={`${item}-${index}`} className="flex items-center gap-10">
                {item}
                <span className="text-honey">✦</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-[72rem] flex-1 px-5 py-16 sm:px-6 sm:py-24">
        <section
          aria-labelledby="what-title"
          className="grid items-start gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20"
        >
          <div>
            <p className="section-kicker">Built for real life</p>
            <h2
              id="what-title"
              className="display-title mt-2 text-3xl sm:text-4xl"
            >
              Ask your Bot. Watch it move.
            </h2>
          </div>
          <div>
            <p className="max-w-2xl text-lg leading-8 text-muted">
              HoneyMatcha is where your Grok Bot steps in when plans cross
              people, calendars, and inboxes — a coffee, a meetup, a hire.
              You stay in control while your Bot handles the back-and-forth.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                ["01", "Connect once", "Link your calendar and Grok Bot securely."],
                ["02", "Delegate freely", "Ask your Bot to schedule, invite, or coordinate."],
                ["03", "Approve clearly", "Review important actions before anything happens."],
              ].map(([number, title, body]) => (
                <div key={number} className="border-l border-line pl-4">
                  <p className="text-xs font-bold text-honey">{number}</p>
                  <h3 className="mt-2 font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="my-16 grid gap-4 sm:my-20 sm:grid-cols-2">
          {JOBS.map(([title, body], index) => (
            <article
              key={title}
              className="surface-card surface-card-interactive group relative overflow-hidden p-6 sm:p-7"
            >
              <span className="text-[0.7rem] font-bold tracking-[0.16em] text-honey uppercase">
                0{index + 1}
              </span>
              <h3 className="mt-3 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
                {title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
              <span
                className="absolute -right-6 -bottom-8 h-24 w-24 rounded-full border border-matcha-soft/10 transition duration-300 group-hover:scale-110"
                aria-hidden="true"
              />
            </article>
          ))}
        </div>

        {discoveryEnabled ? (
          <section aria-labelledby="discovery-title" className="mb-20 sm:mb-28">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
              <div>
                <p className="section-kicker">Agent-powered discovery</p>
                <h2
                  id="discovery-title"
                  className="display-title mt-2 text-3xl sm:text-4xl"
                >
                  Let your agent find potential people to meet.
                </h2>
                <p className="mt-4 text-base leading-7 text-muted">
                  Your agent can explain supported discovery tasks, gather only
                  the information that task needs, and privately look for
                  potential counterparts.
                </p>
                <Link href="/app/discovery" className="button-primary mt-6">
                  Manage discovery
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  [
                    "Recruiting",
                    "Privately compare role and candidate constraints before either person is identified.",
                  ],
                  [
                    "Dating introductions",
                    "Your agent looks privately for adult matches by intent, interests, and city, then asks you before anyone is identified.",
                  ],
                  [
                    "Two human approvals",
                    "Your outgoing request stays private until you approve it. The recipient then makes their own decision.",
                  ],
                  [
                    "No public directory",
                    "Agents receive rotating anonymous handles—not emails, profiles, stable IDs, or private match dimensions.",
                  ],
                ].map(([title, body]) => (
                  <article key={title} className="surface-card surface-card-interactive p-5">
                    <h3 className="font-semibold text-matcha-deep">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <HomeGetStarted signedIn={signedIn} setupComplete={setupComplete} />

        <section aria-labelledby="trust-title" className="mt-20 sm:mt-28">
          <div className="mx-auto max-w-2xl text-center">
            <p className="section-kicker">Always in your control</p>
            <h2
              id="trust-title"
              className="display-title mt-2 text-3xl sm:text-4xl"
            >
              Helpful automation, without the black box.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted">
              HoneyMatcha keeps every move visible and the sensitive decisions
              human.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {TRUST.map((item) => (
              <article
                key={item.title}
                className="surface-card surface-card-interactive p-6 sm:p-7"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-matcha-soft/12 text-lg font-semibold text-matcha">
                  {item.icon}
                </span>
                <h3 className="mt-6 font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="agent-title"
          className="relative mt-20 overflow-hidden rounded-[1.75rem] bg-matcha-deep px-6 py-8 text-white shadow-[0_24px_60px_rgba(23,63,46,0.18)] sm:mt-28 sm:px-10 sm:py-10"
        >
          <div
            className="absolute -top-28 -right-20 h-72 w-72 rounded-full border border-white/10 bg-white/5"
            aria-hidden="true"
          />
          <div
            className="animate-drift-alt absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-honey/15 blur-2xl"
            aria-hidden="true"
          />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="text-xs font-bold tracking-[0.16em] text-honey-soft uppercase">
                Building an agent?
              </p>
              <h2
                id="agent-title"
                className="mt-2 font-[family-name:var(--font-fraunces)] text-2xl font-semibold tracking-[-0.03em] sm:text-3xl"
              >
                Give it a secure coordination layer.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70">
                Start pairing at <code>POST /api/v1/pairings/start</code>, show
                the human a verification link, then exchange the approved code.
                No human passwords, browser automation, or shared credentials.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/agents"
                className="button-secondary border-white/20 bg-white/10 text-white hover:border-white/35 hover:bg-white/15 hover:text-white"
              >
                Grok Bot guide
              </Link>
              <Link
                href="/docs"
                className="button-primary border-honey bg-honey text-matcha-deep shadow-none hover:border-honey-soft hover:bg-honey-soft hover:text-matcha-deep"
              >
                Developer docs
              </Link>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="jump-in-title"
          className="relative mt-16 overflow-hidden rounded-[1.75rem] border border-honey/25 bg-[linear-gradient(135deg,rgba(255,252,243,0.96),rgba(237,244,238,0.92))] px-6 py-10 sm:mt-20 sm:px-10 sm:py-14"
        >
          <div
            className="animate-drift absolute -right-16 -top-20 h-56 w-56 rounded-full bg-honey-soft/40 blur-2xl"
            aria-hidden="true"
          />
          <div className="relative mx-auto max-w-2xl text-center">
            <p className="section-kicker">Ready when you are</p>
            <h2
              id="jump-in-title"
              className="display-title mt-2 text-3xl sm:text-5xl"
            >
              Give your Bot the first ask.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted">
              Two steps. Then your Grok Bot handles the back-and-forth, and you
              only show up when it matters.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              {signedIn ? (
                <Link href="/app" className="button-primary min-h-12 px-5">
                  {setupComplete ? "Open dashboard" : "Continue setup"}
                </Link>
              ) : (
                <Link href="/sign-up" className="button-primary min-h-12 px-5">
                  Create account
                </Link>
              )}
              <Link href="/agents" className="button-secondary min-h-12 px-5">
                Connect Grok Bot
              </Link>
            </div>
          </div>
        </section>

        <footer className="mt-16 flex flex-col gap-4 border-t border-line pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>HoneyMatcha · coordination that crosses inboxes</span>
          <span className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/agents">For Grok Bot</Link>
            <Link href="/docs">Developer docs</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </span>
        </footer>
      </main>
    </div>
  );
}
