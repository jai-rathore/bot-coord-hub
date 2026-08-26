import Link from "next/link";
import { HomeLivePreview } from "@/components/home-live-preview";

const SUPPORTED_ASSISTANTS = [
  "Sage included",
  "ChatGPT",
  "Claude",
  "Gemini",
  "Grok",
  "Cursor",
] as const;

/**
 * The first screen for someone who has never been here.
 *
 * Signed-in people no longer pass through this file at all. They get their own
 * home, so the hero only has one job: say what the thing is and offer the two
 * ways in. Those two are the product: use the agent that comes with the
 * account, or bring the one you already have. Either way it is yours, which
 * is why the headline says "your agent" and not "ours". Everything else is one
 * clear overview below.
 */
export function HomeHero() {
  return (
    <div className="relative z-0 mx-auto grid w-full max-w-[72rem] items-center gap-10 px-5 pt-8 pb-14 sm:px-6 sm:pt-12 sm:pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
      <div>
        <div className="animate-rise inline-flex items-center gap-2 rounded-full border border-matcha-soft/25 bg-white/70 px-3 py-1.5 text-[0.7rem] font-semibold tracking-[0.1em] text-matcha uppercase backdrop-blur-sm">
          <span className="live-dot animate-pulse-live" />
          Recruiting alignment, agent to agent
        </div>
        <h1 className="display-title mt-5 text-[clamp(2.6rem,11vw,5.4rem)] leading-[0.96]">
          <span className="hero-line hero-line-1 block">Know what would</span>
          <span className="display-accent hero-line hero-line-2 mt-1 block">
            make them say yes.
          </span>
        </h1>
        <p className="animate-rise-delay-2 mt-5 max-w-[44ch] text-[1.05rem] leading-7 text-muted">
          Before another cold message, let the candidate&apos;s agent say what is
          off: the company, role, compensation, equity, location, or something
          else. Your recruiter agent can improve the terms and try again.
        </p>
        <p className="animate-rise-delay-2 mt-3 max-w-[44ch] text-sm font-semibold leading-6 text-matcha-deep">
          People enter the conversation once there is a credible reason to talk.
        </p>
        <div className="animate-rise-delay-3 mt-7 flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className="button-primary w-full sm:w-auto sm:px-5">
            Start an alignment
          </Link>
          <Link href="#recruiting-loop" className="button-secondary w-full sm:w-auto sm:px-5">
            See the recruiting loop
          </Link>
        </div>
        <p className="animate-rise-delay-3 mt-3 text-sm text-muted">
          Free in beta. Sage is included, or bring the agent you already use.
        </p>
        <div className="animate-rise-delay-3 mt-6 max-w-xl border-t border-matcha-soft/25 pt-4">
          <p className="text-[0.68rem] font-bold tracking-[0.12em] text-matcha uppercase">
            Use ours or bring yours
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {SUPPORTED_ASSISTANTS.map((assistant) => (
              <span
                key={assistant}
                className="rounded-full border border-white/90 bg-white/68 px-2.5 py-1 text-xs font-semibold text-muted shadow-[0_4px_14px_rgba(23,63,46,0.05)] backdrop-blur-sm"
              >
                {assistant}
              </span>
            ))}
            <Link
              href="/agents"
              className="ml-1 text-xs font-semibold text-matcha-deep"
            >
              See your steps <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
      <div className="animate-rise-delay-2 lg:pt-2">
        <HomeLivePreview />
      </div>
    </div>
  );
}
