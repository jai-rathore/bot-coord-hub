import Link from "next/link";
import { HomeLivePreview } from "@/components/home-live-preview";

/**
 * The first screen for someone who has never been here.
 *
 * Signed-in people no longer pass through this file at all — they get their own
 * home — so the hero only has one job: say what the thing is and offer the two
 * ways in. Those two are the product: use the agent we provide, or bring the
 * one you already have. Everything else is one swipeable rail below.
 */
export function HomeHero() {
  return (
    <div className="relative z-0 mx-auto grid w-full max-w-[72rem] items-center gap-10 px-5 pt-8 pb-14 sm:px-6 sm:pt-12 sm:pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
      <div>
        <div className="animate-rise inline-flex items-center gap-2 rounded-full border border-matcha-soft/25 bg-white/70 px-3 py-1.5 text-[0.7rem] font-semibold tracking-[0.1em] text-matcha uppercase backdrop-blur-sm">
          <span className="live-dot animate-pulse-live" />
          You keep the yes
        </div>
        <h1 className="display-title mt-5 text-[clamp(2.6rem,11vw,5.4rem)] leading-[0.96]">
          <span className="hero-line hero-line-1 block">Sort it out</span>
          <span className="display-accent hero-line hero-line-2 mt-1 block">
            without the group chat.
          </span>
        </h1>
        <p className="animate-rise-delay-2 mt-5 max-w-[38ch] text-[1.05rem] leading-7 text-muted">
          Hand it to Sage, our agent, and it settles without you chasing
          anyone. Already have an agent? Bring that one instead.
        </p>
        <div className="animate-rise-delay-3 mt-7 flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className="button-primary w-full sm:w-auto sm:px-5">
            Create an event
          </Link>
          <Link href="/agents" className="button-secondary w-full sm:w-auto sm:px-5">
            Bring your agent
          </Link>
        </div>
        <p className="animate-rise-delay-3 mt-3 text-sm text-muted">
          Free in beta. Sage is included — there is nothing to install.
        </p>
      </div>
      <div className="animate-rise-delay-2 lg:pt-2">
        <HomeLivePreview />
      </div>
    </div>
  );
}
