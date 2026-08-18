import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { BrandAtmosphere } from "@/components/brand-atmosphere";
import { HomeGetStarted } from "@/components/home-get-started";
import { HomeHero } from "@/components/home-hero";
import { HomeLadder } from "@/components/home-ladder";
import { SiteHeader } from "@/components/site-header";
import { getHomeStatus, isSetupComplete } from "@/lib/home-status";
import { ensureCurrentUser } from "@/lib/users";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";
import { eventsFeatureEnabled } from "@/lib/events-feature";

export const dynamic = "force-dynamic";

type WayTone = {
  card: string;
  eyebrow: string;
  title: string;
  body: string;
  bullet: string;
  cta: string;
  mark: string;
};

/** Each capability reads differently at a glance: warm for a group you already
 *  know, green for one person, deep for someone you have not met. */
const WAY_TONE: Record<string, WayTone> = {
  events: {
    card: "border-honey-soft/55 bg-[linear-gradient(155deg,rgba(255,255,252,0.95),rgba(249,240,216,0.82))]",
    eyebrow: "text-honey",
    title: "text-matcha-deep",
    body: "text-muted",
    bullet: "bg-honey/70",
    cta: "text-matcha-deep",
    mark: "text-honey/75",
  },
  people: {
    card: "border-matcha-soft/45 bg-[linear-gradient(155deg,rgba(255,255,252,0.95),rgba(233,243,235,0.88))]",
    eyebrow: "text-matcha",
    title: "text-matcha-deep",
    body: "text-muted",
    bullet: "bg-matcha-soft",
    cta: "text-matcha-deep",
    mark: "text-matcha-soft",
  },
  discovery: {
    card: "border-matcha-deep bg-[linear-gradient(155deg,#1d4834_0%,#173f2e_60%,#122f22_100%)]",
    eyebrow: "text-honey-soft",
    title: "text-[#f4f8f4]",
    body: "text-[#cfe0d3]",
    bullet: "bg-honey-soft/80",
    cta: "text-honey-soft",
    mark: "text-honey-soft/70",
  },
};

function WayMark({ kind, className }: { kind: string; className: string }) {
  const p = {
    viewBox: "0 0 64 40",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    className,
  };
  if (kind === "events") {
    // many converging on one
    return (
      <svg {...p}>
        <circle cx="46" cy="20" r="7" />
        {[
          [10, 8],
          [8, 20],
          [12, 32],
          [24, 4],
          [26, 36],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r="2.6" />
            <path d={`M${x + 3} ${y} L39 20`} strokeDasharray="2 3" opacity="0.55" />
          </g>
        ))}
      </svg>
    );
  }
  if (kind === "people") {
    // two, meeting in the middle
    return (
      <svg {...p}>
        <circle cx="16" cy="20" r="7.5" />
        <circle cx="48" cy="20" r="7.5" />
        <path d="M24 20h16" strokeDasharray="3 3" />
        <path d="M29 15.5l3 4.5-3 4.5M35 15.5l-3 4.5 3 4.5" opacity="0.7" />
      </svg>
    );
  }
  // veiled: known shapes behind a curtain
  return (
    <svg {...p}>
      <circle cx="14" cy="20" r="6.5" />
      <circle cx="34" cy="13" r="4" opacity="0.6" />
      <circle cx="38" cy="28" r="4" opacity="0.6" />
      <circle cx="54" cy="20" r="5" opacity="0.35" />
      <path d="M24 6v28" strokeDasharray="3 4" opacity="0.8" />
      <path d="M46 8v24" strokeDasharray="3 4" opacity="0.45" />
    </svg>
  );
}

const WAYS = [
  {
    key: "events",
    eyebrow: "A group you know",
    title: "Events",
    body: "Share one link in the group chat. Everyone taps what works, and it settles on a deadline and a headcount instead of waiting for all ten replies.",
    points: [
      "Non-responders never block the plan",
      "Show names, counts only, or nothing",
    ],
    href: "/app/events/new",
    cta: "Create an event",
    featured: true,
  },
  {
    key: "people",
    eyebrow: "One person you know",
    title: "Connections",
    body: "Invite someone by email or an approval-gated link. Once connected, the two agents compare free/busy and propose a time neither of you had to hunt for.",
    points: [
      "Free/busy only — never event titles",
      "Revoke any connection at any time",
    ],
    href: "/app/people",
    cta: "Invite someone",
    featured: false,
  },
  {
    key: "discovery",
    eyebrow: "Someone you haven't met",
    title: "Discovery",
    body: "Describe what you are looking for — a hire, a local meetup, an introduction. Your agent looks privately and asks you before anyone is identified.",
    points: [
      "Rotating handles, no public directory",
      "Two human approvals before contact",
    ],
    href: "/app/discovery",
    cta: "Explore discovery",
    featured: false,
  },
] as const;

const STEPS = [
  ["01", "Start something", "Create an event, invite a person, or describe who you want to meet."],
  ["02", "It coordinates", "Replies, free/busy, and reminders are handled without you in the thread."],
  ["03", "You decide", "Bookings and introductions pause for your yes. An agent can never approve for you."],
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
  const eventsEnabled = eventsFeatureEnabled();

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
        {/* The three capabilities as equals. Which one you reach for depends
            on who you are coordinating with, not on how the product works. */}
        <section aria-labelledby="ways-title" className="scroll-mt-24">
          <div className="max-w-2xl">
            <p className="section-kicker">Three ways in</p>
            <h2 id="ways-title" className="display-title mt-2 text-3xl sm:text-4xl">
              It depends who you&apos;re trying to reach.
            </h2>
            <p className="mt-4 text-lg leading-8 text-muted">
              A group you already know, one person you know, or someone you
              haven&apos;t met yet. Same rule underneath all three: HoneyMatcha
              does the chasing, and nothing happens until you approve it.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {WAYS.filter((card) =>
              card.key === "events"
                ? eventsEnabled
                : card.key === "discovery"
                  ? discoveryEnabled
                  : true,
            ).map((card) => (
              <article
                key={card.title}
                className={`cap-card surface-card group relative flex flex-col overflow-hidden border p-6 sm:p-7 ${WAY_TONE[card.key].card}`}
              >
                <div className="relative flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <p
                      className={`text-[0.7rem] font-bold tracking-[0.14em] uppercase ${WAY_TONE[card.key].eyebrow}`}
                    >
                      {card.eyebrow}
                    </p>
                    <WayMark
                      kind={card.key}
                      className={`cap-mark h-9 w-14 shrink-0 ${WAY_TONE[card.key].mark}`}
                    />
                  </div>
                  <h3
                    className={`mt-2 font-[family-name:var(--font-fraunces)] text-2xl font-semibold ${WAY_TONE[card.key].title}`}
                  >
                    {card.title}
                  </h3>
                  <p className={`mt-3 text-sm leading-6 ${WAY_TONE[card.key].body}`}>
                    {card.body}
                  </p>
                  <ul className="mt-5 space-y-2">
                    {card.points.map((point) => (
                      <li
                        key={point}
                        className={`flex gap-2 text-sm leading-6 ${WAY_TONE[card.key].body}`}
                      >
                        <span
                          className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${WAY_TONE[card.key].bullet}`}
                          aria-hidden="true"
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6 flex-1" />
                  <Link
                    href={card.href}
                    className={`font-semibold no-underline ${WAY_TONE[card.key].cta}`}
                  >
                    {card.cta} <span aria-hidden="true">&rarr;</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="mt-16 sm:mt-24">
          <HomeLadder discoveryEnabled={discoveryEnabled} />
        </div>

        {/* The agent layer sits under all three, so it comes after them. */}
        <section
          aria-labelledby="how-title"
          className="mt-16 grid items-start gap-8 sm:mt-24 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20"
        >
          <div>
            <p className="section-kicker">How it works</p>
            <h2 id="how-title" className="display-title mt-2 text-3xl sm:text-4xl">
              You approve. It does the rest.
            </h2>
          </div>
          <div>
            <p className="max-w-2xl text-lg leading-8 text-muted">
              You can use HoneyMatcha on its own — an event link needs no setup
              beyond signing in. Connect an agent and it starts doing the
              back-and-forth for you: comparing calendars, chasing replies, and
              bringing you only the decisions that need a person.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {STEPS.map(([number, title, body]) => (
                <div key={number} className="border-l border-line pl-4">
                  <p className="text-xs font-bold text-honey">{number}</p>
                  <h3 className="mt-2 font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div id="get-started" className="scroll-mt-24">
          <HomeGetStarted signedIn={signedIn} setupComplete={setupComplete} />
        </div>

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
