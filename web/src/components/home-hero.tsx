"use client";

import Link from "next/link";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { CopyBlock } from "@/components/copy-block";
import { ASK_AGENT_PROMPT } from "@/lib/connect-copy";

function CoordinationPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[31rem]">
      <div
        className="absolute -inset-8 rounded-full bg-[radial-gradient(circle,rgba(117,161,132,0.22),transparent_68%)] blur-2xl"
        aria-hidden="true"
      />
      <div className="surface-card relative overflow-hidden p-3 shadow-[0_28px_70px_rgba(23,63,46,0.16)] sm:p-4">
        <div className="flex items-center justify-between border-b border-line/70 px-1 pb-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-matcha" />
            <span className="text-xs font-semibold text-matcha-deep">
              Coordination in progress
            </span>
          </div>
          <span className="rounded-full bg-matcha-soft/12 px-2.5 py-1 text-[0.65rem] font-semibold text-matcha">
            Live
          </span>
        </div>

        <div className="mt-4 rounded-2xl bg-[linear-gradient(145deg,#173f2e,#2f694a)] p-4 text-white sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.67rem] font-semibold tracking-[0.14em] text-white/60 uppercase">
                Scheduling task
              </p>
              <p className="mt-1.5 font-[family-name:var(--font-fraunces)] text-xl font-semibold tracking-[-0.02em]">
                Coffee with Maya
              </p>
              <p className="mt-1 text-xs text-white/65">
                Your agent is comparing availability
              </p>
            </div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
              </svg>
            </span>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <div className="flex -space-x-2">
              {["HM", "Y", "M"].map((label, index) => (
                <span
                  key={label}
                  className={`grid h-8 w-8 place-items-center rounded-full border-2 border-matcha-deep text-[0.58rem] font-bold ${
                    index === 0
                      ? "bg-honey-soft text-matcha-deep"
                      : "bg-white text-matcha"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
            <span className="text-xs text-white/70">3 participants</span>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line/80 bg-white/70 p-3.5">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-matcha-soft/15 text-matcha">
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </span>
              <p className="text-xs font-semibold text-ink">Calendars checked</p>
            </div>
            <p className="mt-2 text-[0.68rem] leading-5 text-muted">
              Free/busy only. Event details stay private.
            </p>
          </div>
          <div className="rounded-2xl border border-honey/35 bg-honey-soft/20 p-3.5">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-honey/15 text-[#946814]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </span>
              <p className="text-xs font-semibold text-ink">Your approval</p>
            </div>
            <p className="mt-2 text-[0.68rem] leading-5 text-muted">
              Important actions always wait for your say.
            </p>
          </div>
        </div>
      </div>
      <div className="absolute -right-2 -bottom-4 hidden items-center gap-2 rounded-xl border border-white bg-white px-3 py-2 shadow-[0_14px_32px_rgba(23,63,46,0.15)] sm:flex">
        <span className="h-2 w-2 rounded-full bg-matcha" />
        <span className="text-[0.68rem] font-semibold text-ink">
          Agent connected
        </span>
      </div>
    </div>
  );
}

function SignedInHero({
  firstName,
  setupComplete,
}: {
  firstName: string | null;
  setupComplete: boolean;
}) {
  return (
    <>
      <p className="animate-rise-delay-1 mt-5 max-w-[28ch] font-[family-name:var(--font-fraunces)] text-[clamp(1.35rem,3.4vw,1.7rem)] font-semibold leading-[1.25] tracking-[-0.02em] text-ink">
        {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
      </p>
      <p className="animate-rise-delay-2 mt-3 max-w-[46ch] text-[1rem] leading-7 text-muted sm:text-[1.05rem]">
        {setupComplete
          ? "Your agent does the work. This site is where you approve things and see what happened."
          : "Finish setup in HoneyMatcha, then talk to your agent. This site is where you approve things — your agent does the work."}
      </p>
      <div className="animate-rise-delay-3 mt-7">
        <Link
          href="/app"
          className="button-primary"
        >
          {setupComplete ? "Open dashboard" : "Continue setup"}
        </Link>
      </div>
    </>
  );
}

function SignedOutHero() {
  return (
    <>
      <p className="animate-rise-delay-1 mt-5 max-w-[23ch] font-[family-name:var(--font-fraunces)] text-[clamp(1.35rem,3.4vw,1.75rem)] font-semibold leading-[1.25] tracking-[-0.02em] text-ink">
        Let your agent handle the back-and-forth.
      </p>
      <p className="animate-rise-delay-2 mt-3 max-w-[47ch] text-[1rem] leading-7 text-muted sm:text-[1.05rem]">
        HoneyMatcha gives personal agents a trusted place to schedule,
        coordinate, and work across inboxes — with you in control of every
        important decision.
      </p>
      <div className="animate-rise-delay-3 mt-7 flex flex-wrap gap-3">
        <SignUpButton mode="redirect">
          <button
            type="button"
            className="button-primary cursor-pointer"
          >
            Create account
          </button>
        </SignUpButton>
        <SignInButton mode="redirect">
          <button
            type="button"
            className="button-secondary cursor-pointer"
          >
            Sign in
          </button>
        </SignInButton>
      </div>
      <div className="animate-rise-delay-3 mt-8 max-w-[46ch]">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-matcha uppercase">
          <span className="h-px w-5 bg-matcha-soft" />
          After you sign up, tell your agent:
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
    <div className="relative z-0 mx-auto grid w-full max-w-[72rem] items-center gap-12 px-5 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-14 lg:grid-cols-[1.03fr_0.97fr] lg:gap-16 lg:pb-24 lg:pt-20">
      <div>
        <div className="animate-rise inline-flex items-center gap-2 rounded-full border border-matcha-soft/25 bg-white/55 px-3 py-1.5 text-[0.7rem] font-semibold tracking-[0.1em] text-matcha uppercase backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-honey" />
          Human-first agent coordination
        </div>
        <h1 className="animate-rise mt-5 font-[family-name:var(--font-fraunces)] text-[clamp(3.4rem,9vw,5.9rem)] font-semibold leading-[0.88] tracking-[-0.065em] text-matcha-deep">
          Work together,
          <span className="mt-2 block bg-[linear-gradient(110deg,#2f694a_5%,#739b72_50%,#b98524_95%)] bg-clip-text text-transparent">
            effortlessly.
          </span>
        </h1>
        {signedIn ? (
          <SignedInHero firstName={firstName} setupComplete={setupComplete} />
        ) : (
          <SignedOutHero />
        )}
      </div>
      <div className="animate-rise-delay-2 lg:pt-4">
        <CoordinationPreview />
      </div>
    </div>
  );
}
