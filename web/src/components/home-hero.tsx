"use client";

import Link from "next/link";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { HomeLivePreview } from "@/components/home-live-preview";

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
      <p className="animate-rise-delay-1 mt-6 max-w-[26ch] font-[family-name:var(--font-fraunces)] text-[clamp(1.35rem,3.4vw,1.85rem)] font-semibold leading-[1.25] tracking-[-0.02em] text-ink">
        Pick a time with ten people. Or one. Or someone you haven&apos;t met.
      </p>
      <p className="animate-rise-delay-2 mt-3 max-w-[48ch] text-[1.05rem] leading-7 text-muted sm:text-[1.1rem]">
        Share one link and HoneyMatcha settles it on a deadline instead of
        waiting for everyone. Connect an agent and it does the back-and-forth
        for you. Either way, nothing is booked until you say yes.
      </p>
      <div className="animate-rise-delay-3 mt-8 flex flex-wrap gap-3">
        <SignUpButton mode="redirect">
          <button type="button" className="button-primary min-h-12 cursor-pointer px-5">
            Create an event
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
      <p className="animate-rise-delay-3 mt-3 text-sm text-muted">
        Free while we&apos;re in beta. No agent required.
      </p>
      <p className="animate-rise-delay-3 mt-6 text-sm text-muted">
        Already have an agent?{" "}
        <a href="#get-started" className="font-semibold text-matcha-deep">
          Connect it in two steps
        </a>
        .
      </p>
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
          You keep the yes
        </div>
        <h1 className="display-title animate-rise mt-5 text-[clamp(2.9rem,7.6vw,5.4rem)]">
          Sort it out
          <span className="display-accent mt-1 block">without the group chat.</span>
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
