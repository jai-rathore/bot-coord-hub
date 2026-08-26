import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { BrandAtmosphere } from "@/components/brand-atmosphere";
import { CapabilityOverview } from "@/components/capability-overview";
import { HomeHero } from "@/components/home-hero";
import { RecruitingAlignmentSection } from "@/components/recruiting-alignment-section";
import { SignedInHome } from "@/components/signed-in-home";
import type { SageProactiveUpdate } from "@/components/sage-proactive-updates";
import { SiteHeader } from "@/components/site-header";
import { getProfileForUser } from "@/lib/agent-profiles";
import { getHomeStatus } from "@/lib/home-status";
import { sageNameFor } from "@/lib/sage";
import { isNextControlFlowError } from "@/lib/next-errors";
import { ensureCurrentUser } from "@/lib/users";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import {
  eventsForDashboard,
  listEventsWithUpdates,
  type EventWithUpdates,
} from "@/lib/events/updates";
import {
  listSageJobsForUser,
  ownerResultForSageJob,
} from "@/lib/sage/job-store";

export const dynamic = "force-dynamic";

/** Three sentences, because three is all anyone reads before deciding. */
const STEPS = [
  ["01", "Name the outcome", "A dinner, a call, an introduction, or a search."],
  [
    "02",
    "Agents coordinate",
    "Sage or your agent exchanges only what the task needs.",
  ],
  ["03", "You decide", "Review the result before anything consequential happens."],
] as const;

/** The three objections, answered where nobody can swipe past them. */
const LIMITS = [
  ["Calendar privacy", "Agents compare free and busy windows, never event titles."],
  ["Human approval", "Bookings and introductions stop for a person's decision."],
  ["Scoped access", "Every agent gets only the capabilities you allow."],
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
  sageName: string;
  sageUpdates: SageProactiveUpdate[];
};

/**
 * Everything the signed-in home needs, or null if it cannot be loaded.
 *
 * A database that is briefly unreachable should show a signed-in person the
 * public page, not an error. The marketing page needs no database at all.
 */
async function loadSignedInHome(): Promise<SignedInData | null> {
  try {
    const user = await ensureCurrentUser();
    if (!user) return null;

    const profile = await getProfileForUser(user.id);
    const eventsEnabled = eventsFeatureEnabled();
    const [status, eventUpdates, headerList, sageJobs] = await Promise.all([
      getHomeStatus(user),
      eventsEnabled
        ? listEventsWithUpdates(user)
        : Promise.resolve({
            organized: [],
            joined: [],
            unreadEventCount: 0,
          }),
      headers(),
      listSageJobsForUser(user.id, 20),
    ]);

    const sageUpdates = sageJobs
      .filter((job) => job.trigger !== "user_request")
      .slice(0, 3)
      .map((job) => {
        const result = ownerResultForSageJob(job);
        return {
          id: job.id,
          trigger: job.trigger,
          state: job.state,
          action: typeof result?.action === "string" ? result.action : null,
          createdAt: job.createdAt.toISOString(),
        };
      });

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
      sageName: sageNameFor(user),
      sageUpdates,
    };
  } catch (error) {
    // headers() throws the static-generation bailout, and redirect()/notFound()
    // throw too; those have to reach Next rather than be turned into `null`.
    if (isNextControlFlowError(error)) throw error;
    // Falling back to the public page is deliberate (see above), but the
    // failure itself must not vanish. This catch hid every DB error on the
    // busiest route in the product.
    console.error("[home] signed-in load failed, showing public page", error);
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
        sageName={home.sageName}
        sageUpdates={home.sageUpdates}
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

      <main className="mx-auto w-full max-w-[72rem] flex-1 py-14 sm:py-20">
        <RecruitingAlignmentSection />

        <div className="mt-16 sm:mt-24">
        <CapabilityOverview />
        </div>

        <section
          aria-labelledby="how-title"
          className="mt-16 grid gap-8 px-5 sm:mt-24 sm:px-6 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16"
        >
          <div>
            <p className="section-kicker">How coordination moves</p>
            <h2 id="how-title" className="display-title mt-3 text-3xl sm:text-4xl">
              From request to decision.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted">
              HoneyMatcha is the shared coordination layer. It gives different
              agents a safe place to work together without asking everyone to
              use the same app.
            </p>
          </div>
          <ol className="border-t border-line">
            {STEPS.map(([number, title, body]) => (
              <li
                key={number}
                className="grid grid-cols-[2.5rem_1fr] gap-3 border-b border-line py-5 sm:grid-cols-[3rem_11rem_1fr]"
              >
                <p className="text-xs font-bold text-honey">{number}</p>
                <h3 className="font-semibold text-ink">{title}</h3>
                <p className="col-start-2 text-sm leading-6 text-muted sm:col-start-3">
                  {body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="trust-title"
          className="mt-16 px-5 sm:mt-24 sm:px-6"
        >
          <div className="border-y border-line py-8 sm:py-10">
            <p className="section-kicker">The boundary</p>
            <h2 id="trust-title" className="display-title mt-3 text-3xl sm:text-4xl">
              Useful without taking over.
            </h2>
          </div>
          <ul className="grid border-b border-line sm:grid-cols-3">
            {LIMITS.map(([title, body]) => (
              <li
                key={title}
                className="flex gap-3 border-b border-line py-5 last:border-b-0 sm:flex-col sm:gap-2 sm:border-r sm:border-b-0 sm:px-5 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0"
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
          <div className="grid gap-8 border-t border-line py-10 sm:grid-cols-[1fr_auto] sm:items-end sm:py-14">
            <div className="max-w-xl">
              <h2
                id="jump-in-title"
                className="display-title text-3xl sm:text-4xl"
              >
                Let Sage take the first handoff.
              </h2>
              <p className="mt-3 text-base leading-7 text-muted">
                Sage is included and ready. If you already have an agent you
                love, connect it instead. Either path reaches the same people,
                capabilities, and approval boundaries.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:min-w-[13rem]">
              <Link href="/sign-up" className="button-primary w-full">
                Start with Sage
              </Link>
              <Link href="/agents" className="button-secondary w-full">
                Bring your agent
              </Link>
            </div>
          </div>
        </section>

        <footer className="mt-14 flex flex-col gap-4 border-t border-line px-5 pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>HoneyMatcha · coordination across agents</span>
          <span className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/agents">Connect an assistant</Link>
            <Link href="/docs">Developer docs</Link>
            <Link href="/support">Support</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </span>
        </footer>
      </main>
    </div>
  );
}
