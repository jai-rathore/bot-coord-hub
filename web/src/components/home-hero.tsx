"use client";

import Link from "next/link";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { CopyBlock } from "@/components/copy-block";
import { HomeLivePreview } from "@/components/home-live-preview";
import { ASK_AGENT_PROMPT, GROK_BOT_URL } from "@/lib/connect-copy";

function SignedInHero({
  firstName,
  setupComplete,
}: {
  firstName: string | null;
  setupComplete: boolean;
}) {
  return (
    <>
      <p className="animate-rise-delay-1 mt-6 max-w-[28ch] font-[family-name:var(--font-fraunces)] text-[clamp(1.4rem,3.4vw,1.85rem)] font-semibold leading-[1.25] tracking-[-0.02em] text-ink">
        {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
      </p>
      <p className="animate-rise-delay-2 mt-3 max-w-[46ch] text-[1.05rem] leading-7 text-muted sm:text-[1.1rem]">
        {setupComplete
          ? "Your Grok Bot is already coordinating. Jump in to approve what’s waiting — or send it the next plan."
          : "Two steps left, then talk to your Grok Bot. HoneyMatcha is only for the moments that need your yes."}
      </p>
      <div className="animate-rise-delay-3 mt-8">
        <Link href="/app" className="button-primary min-h-12 px-5">
          {setupComplete ? "Open dashboard" : "Continue setup"}
        </Link>
      </div>
    </>
  );
}

function SignedOutHero() {
  return (
    <>
      <p className="animate-rise-delay-1 mt-6 max-w-[24ch] font-[family-name:var(--font-fraunces)] text-[clamp(1.4rem,3.4vw,1.9rem)] font-semibold leading-[1.25] tracking-[-0.02em] text-ink">
        Give your Grok Bot the next plan.
      </p>
      <p className="animate-rise-delay-2 mt-3 max-w-[47ch] text-[1.05rem] leading-7 text-muted sm:text-[1.1rem]">
        It schedules, invites, and coordinates across people and calendars.
        You only show up when something needs a yes.
      </p>
      <div className="animate-rise-delay-3 mt-8 flex flex-wrap gap-3">
        <SignUpButton mode="redirect">
          <button type="button" className="button-primary min-h-12 cursor-pointer px-5">
            Get started
          </button>
        </SignUpButton>
        <SignInButton mode="redirect">
          <button
            type="button"
            className="button-secondary min-h-12 cursor-pointer px-5"
          >
            Sign in
          </button>
        </SignInButton>
      </div>
      <div className="animate-rise-delay-3 mt-8 max-w-[46ch]">
        <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold tracking-[0.08em] text-matcha uppercase">
          <span className="h-px w-5 bg-matcha-soft" />
          After you sign up, open{" "}
          <a href={GROK_BOT_URL} className="underline">
            Grok Bot
          </a>{" "}
          and paste:
        </p>
        <CopyBlock text={ASK_AGENT_PROMPT} />
      </div>
    </>
  );
}

export function HomeHero({
  signedIn,
  setupComplete,
  firstName,
}: {
  signedIn: boolean;
  setupComplete: boolean;
  firstName: string | null;
}) {
  return (
    <div className="relative z-0 mx-auto grid w-full max-w-[72rem] items-center gap-12 px-5 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-24 lg:pt-16">
      <div>
        <div className="animate-rise inline-flex items-center gap-2 rounded-full border border-matcha-soft/25 bg-white/70 px-3 py-1.5 text-[0.7rem] font-semibold tracking-[0.1em] text-matcha uppercase backdrop-blur-sm">
          <span className="live-dot animate-pulse-live" />
          Your Grok Bot handles the rest
        </div>
        <h1 className="display-title animate-rise mt-5 text-[clamp(3.35rem,8.6vw,6.1rem)]">
          Come together,
          <span className="display-accent mt-1 block">effortlessly.</span>
        </h1>
        {signedIn ? (
          <SignedInHero firstName={firstName} setupComplete={setupComplete} />
        ) : (
          <SignedOutHero />
        )}
      </div>
      <div className="animate-rise-delay-2 lg:pt-2">
        <HomeLivePreview />
      </div>
    </div>
  );
}
