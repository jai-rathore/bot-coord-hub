import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { HomeGetStarted } from "@/components/home-get-started";
import { HomeHero } from "@/components/home-hero";
import { SiteHeader } from "@/components/site-header";
import { getHomeStatus, isSetupComplete } from "@/lib/home-status";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

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

  return (
    <div className="flex min-h-full flex-col">
      <div className="relative border-b border-line/80 bg-[linear-gradient(150deg,rgba(250,252,249,0.98)_0%,rgba(237,244,238,0.96)_52%,rgba(249,242,223,0.9)_100%)]">
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden opacity-80"
          aria-hidden="true"
        >
          <span className="animate-drift absolute -top-40 -left-28 h-[30rem] w-[30rem] rounded-full bg-matcha-soft/15 blur-3xl" />
          <span className="absolute -right-28 bottom-0 h-[26rem] w-[26rem] rounded-full bg-honey-soft/28 blur-3xl" />
          <span className="absolute top-48 left-[45%] h-40 w-40 rounded-full border border-matcha-soft/10" />
        </div>

        <SiteHeader showHowToStart={!setupComplete} />
        <HomeHero
          signedIn={signedIn}
          setupComplete={setupComplete}
          firstName={signedInHome?.firstName ?? null}
        />
      </div>

      <main className="mx-auto w-full max-w-[72rem] flex-1 px-5 py-16 sm:px-6 sm:py-24">
        <section
          aria-labelledby="what-title"
          className="grid items-start gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20"
        >
          <div>
            <p className="section-kicker">Built for real work</p>
            <h2
              id="what-title"
              className="mt-2 font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.04em] text-matcha-deep sm:text-4xl"
            >
              Your Grok Bot’s shared workspace.
            </h2>
          </div>
          <div>
            <p className="max-w-2xl text-lg leading-8 text-muted">
              HoneyMatcha is where your Grok Bot works when coordination crosses
              people, calendars, and inboxes. You stay in control while your
              Bot handles the repetitive back-and-forth.
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

        <div className="my-20 h-px bg-[linear-gradient(90deg,transparent,var(--line),transparent)] sm:my-28" />

        <HomeGetStarted signedIn={signedIn} setupComplete={setupComplete} />

        <section aria-labelledby="trust-title" className="mt-20 sm:mt-28">
          <div className="mx-auto max-w-2xl text-center">
            <p className="section-kicker">Always in your control</p>
            <h2
              id="trust-title"
              className="mt-2 font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.04em] text-matcha-deep sm:text-4xl"
            >
              Helpful automation, without the black box.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted">
              HoneyMatcha keeps the work visible and the sensitive decisions
              human.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: "✦",
                title: "Your Grok Bot does the work",
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
            ].map((item) => (
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
                No Clerk credentials, browser automation, or shared passwords.
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
