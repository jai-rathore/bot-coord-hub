import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { BrandAtmosphere } from "@/components/brand-atmosphere";
import { CapabilityCarousel } from "@/components/capability-carousel";
import { HomeHero } from "@/components/home-hero";
import { SignedInHome } from "@/components/signed-in-home";
import { SiteHeader } from "@/components/site-header";
import { getProfileForUser } from "@/lib/agent-profiles";
import { getHomeStatus } from "@/lib/home-status";
import { ensureCurrentUser } from "@/lib/users";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import {
  eventsForDashboard,
  type EventWithUpdates,
} from "@/lib/events/updates";
import { listEventsWithUpdates } from "@/lib/events/load-updates";

export const dynamic = "force-dynamic";

/** Three sentences, because three is all anyone reads before deciding. */
const STEPS = [
  ["01", "Start it", "An event, a person, or a scan."],
  ["02", "The agent chases", "Replies, calendars, reminders."],
  ["03", "You decide", "Nothing books without your yes."],
] as const;

/** The three objections, answered where nobody can swipe past them. */
const LIMITS = [
  ["Never reads your calendar", "Free/busy only. Event titles stay yours."],
  ["Never books on its own", "Every real booking waits for your yes."],
  ["Never approves as you", "Agent credentials cannot sign off on anything."],
] as const;

function originFromHeaders(list: Headers) {
  const proto = list.get("x-forwarded-proto") ?? "https";
  const host =
    list.get("x-forwarded-host") ?? list.get("host") ?? "honeymatcha.io";
  return `${proto}://${host}`;
}

type SignedInData = {
  handle: string | null;
  origin: string;
  events: EventWithUpdates[];
  unreadEventCount: number;
  eventsEnabled: boolean;
  agentConnected: boolean;
  calendarConnected: boolean;
  attentionCount: number;
};

/**
 * Everything the signed-in home needs, or null if it cannot be loaded.
 *
 * A database that is briefly unreachable should show a signed-in person the
 * public page, not an error — the marketing page needs no database at all.
 */
async function loadSignedInHome(): Promise<SignedInData | null> {
  try {
    const user = await ensureCurrentUser();
    if (!user) return null;

    const profile = await getProfileForUser(user.id);
    const eventsEnabled = eventsFeatureEnabled();
    const [status, eventUpdates, headerList] = await Promise.all([
      getHomeStatus(user),
      eventsEnabled
        ? listEventsWithUpdates(user)
        : Promise.resolve({
            organized: [],
            joined: [],
            unreadEventCount: 0,
          }),
      headers(),
    ]);

    return {
      handle: profile?.handle ?? null,
      origin: originFromHeaders(headerList),
      events: eventsForDashboard([
        ...eventUpdates.organized,
        ...eventUpdates.joined,
      ]),
      unreadEventCount: eventUpdates.unreadEventCount,
      eventsEnabled,
      agentConnected: status.agent.connected,
      calendarConnected: status.calendarConnected,
      attentionCount: status.attentionCount,
    };
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const clerkUser = await currentUser();
  const home = clerkUser ? await loadSignedInHome() : null;

  if (home) {
    // Same guard the app shell applies: a handle is what makes the QR code and
    // the public page exist, so it is chosen before anything else.
    if (!home.handle) redirect("/setup");

    return (
      <SignedInHome
        firstName={clerkUser?.firstName?.trim() || null}
        handle={home.handle}
        origin={home.origin}
        events={home.events}
        unreadEventCount={home.unreadEventCount}
        eventsEnabled={home.eventsEnabled}
        discoveryEnabled={discoveryFeatureEnabled()}
        agentConnected={home.agentConnected}
        calendarConnected={home.calendarConnected}
        attentionCount={home.attentionCount}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="relative border-b border-line/80 bg-[linear-gradient(150deg,rgba(250,252,249,0.98)_0%,rgba(237,244,238,0.96)_52%,rgba(249,242,223,0.92)_100%)]">
        <BrandAtmosphere />
        <SiteHeader />
        <HomeHero />
      </div>

      {/* No horizontal padding here: the capability rail bleeds to the screen
          edge on a phone so a half-visible next card shows it can be swiped. */}
      <main className="mx-auto w-full max-w-[72rem] flex-1 py-14 sm:py-20">
        <CapabilityCarousel />

        <section
          aria-labelledby="how-title"
          className="mt-16 px-5 sm:mt-24 sm:px-6"
        >
          <h2 id="how-title" className="display-title text-3xl sm:text-4xl">
            How it goes.
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {STEPS.map(([number, title, body]) => (
              <div key={number} className="border-l border-line pl-4">
                <p className="text-xs font-bold text-honey">{number}</p>
                <h3 className="mt-1.5 font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="trust-title"
          className="mt-16 px-5 sm:mt-24 sm:px-6"
        >
          <h2 id="trust-title" className="display-title text-3xl sm:text-4xl">
            What it never does.
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {LIMITS.map(([title, body]) => (
              <li
                key={title}
                className="surface-card flex gap-3 p-4 sm:flex-col sm:gap-2"
              >
                <span
                  className="mt-0.5 shrink-0 text-matcha sm:mt-0"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3.5 5 6v6c0 4.5 3 7.4 7 8.5 4-1.1 7-4 7-8.5V6l-7-2.5Z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </span>
                <div>
                  <h3 className="font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="jump-in-title"
          className="mt-16 px-5 sm:mt-24 sm:px-6"
        >
          <div className="relative overflow-hidden rounded-[1.75rem] border border-honey/25 bg-[linear-gradient(135deg,rgba(255,252,243,0.96),rgba(237,244,238,0.92))] px-6 py-10 text-center sm:px-10 sm:py-14">
            <div
              className="animate-drift absolute -top-20 -right-16 h-56 w-56 rounded-full bg-honey-soft/40 blur-2xl"
              aria-hidden="true"
            />
            <div className="relative mx-auto max-w-xl">
              <h2
                id="jump-in-title"
                className="display-title text-3xl sm:text-4xl"
              >
                Sort out the first one.
              </h2>
              <p className="mt-3 text-base leading-7 text-muted">
                Free while we&apos;re in beta. Sage is included — bring your
                own agent only if you want the rest of it today.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link href="/sign-up" className="button-primary w-full sm:w-auto">
                  Create account
                </Link>
                <Link href="/agents" className="button-secondary w-full sm:w-auto">
                  Connect an agent
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-14 flex flex-col gap-4 border-t border-line px-5 pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>HoneyMatcha · coordination that crosses inboxes</span>
          <span className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/agents">For agents</Link>
            <Link href="/docs">Developer docs</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </span>
        </footer>
      </main>
    </div>
  );
}
