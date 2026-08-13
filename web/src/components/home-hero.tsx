"use client";

import Link from "next/link";
import {
  Show,
  SignInButton,
  SignUpButton,
  useUser,
} from "@clerk/nextjs";
import { BrandHero } from "@/components/brand-mark";

const NEXT_ACTIONS = [
  {
    href: "/app",
    label: "Open HoneyMatcha",
    detail: "see tasks and anything that needs you",
  },
  {
    href: "/agents",
    label: "Connect your agent",
    detail: "approve a short-lived pairing in your browser",
  },
  {
    href: "/app/people",
    label: "Add someone",
    detail: "choose who your agent can coordinate with",
  },
  {
    href: "/app/settings",
    label: "Connect Calendar",
    detail: "free/busy for scheduling",
  },
] as const;

function SignedInHero() {
  const { user } = useUser();
  const name = user?.firstName?.trim();

  return (
    <>
      <p className="animate-rise-delay-1 mt-4 max-w-[20ch] font-[family-name:var(--font-fraunces)] text-[clamp(1.35rem,3.6vw,2.05rem)] font-semibold leading-[1.22] tracking-[-0.02em] text-ink">
        {name ? `Welcome back, ${name}` : "Welcome back"}
      </p>
      <p className="animate-rise-delay-2 mt-3 max-w-[38ch] text-[1.05rem] leading-7 text-muted">
        Your agent handles the back-and-forth. You step in only when needed.
      </p>
      <ul className="animate-rise-delay-3 mt-6 m-0 grid list-none gap-2.5 p-0">
        {NEXT_ACTIONS.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              className="group grid grid-cols-[auto_1fr] items-start gap-2.5 text-ink no-underline"
            >
              <span
                aria-hidden="true"
                className="mt-[0.55em] h-[0.45rem] w-[0.45rem] rounded-full bg-matcha-soft transition group-hover:bg-matcha"
              />
              <span>
                <span className="font-semibold text-matcha-deep group-hover:text-matcha">
                  {action.label}
                </span>
                <span className="text-muted"> — {action.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="animate-rise-delay-3 mt-7">
        <Link
          href="/app"
          className="hm-btn-primary inline-flex items-center justify-center rounded-full border border-matcha-deep px-[1.2rem] py-[0.78rem] text-[0.95rem] font-semibold text-[#f7faf6] no-underline transition hover:-translate-y-px hover:text-[#f7faf6]"
        >
          Open HoneyMatcha
        </Link>
      </div>
    </>
  );
}

function SignedOutHero() {
  return (
    <>
      <p className="animate-rise-delay-1 mt-4 max-w-[18ch] font-[family-name:var(--font-fraunces)] text-[clamp(1.35rem,3.6vw,2.05rem)] font-semibold leading-[1.22] tracking-[-0.02em] text-ink">
        Let your agent handle the back-and-forth.
      </p>
      <p className="animate-rise-delay-2 mt-3 max-w-[40ch] text-[1.05rem] leading-7 text-muted">
        Tell your agent what needs to happen. HoneyMatcha helps it coordinate
        with other people, their agents, and people without agents.
      </p>
      <div className="animate-rise-delay-3 mt-7 flex flex-wrap gap-3">
        <SignUpButton mode="redirect">
          <button
            type="button"
            className="hm-btn-primary inline-flex cursor-pointer items-center justify-center rounded-full border border-matcha-deep px-[1.2rem] py-[0.78rem] text-[0.95rem] font-semibold text-[#f7faf6] transition hover:-translate-y-px"
          >
            Connect my agent
          </button>
        </SignUpButton>
        <SignInButton mode="redirect">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center justify-center rounded-full border border-line bg-[rgba(255,252,246,0.55)] px-[1.2rem] py-[0.78rem] text-[0.95rem] font-semibold text-matcha-deep transition hover:-translate-y-px hover:border-matcha-soft hover:bg-[rgba(255,252,246,0.85)]"
          >
            Sign in
          </button>
        </SignInButton>
      </div>
    </>
  );
}

export function HomeHero() {
  return (
    <div className="relative z-0 mx-auto grid w-[min(72rem,calc(100%-2rem))] items-center gap-6 px-0 pb-12 pt-4 sm:gap-10 sm:pb-16 sm:pt-6 lg:grid-cols-[1.08fr_0.92fr]">
      <div className="max-w-[36rem]">
        <p className="animate-rise text-[0.78rem] font-semibold uppercase tracking-[0.2em] text-matcha">
          Coordination for people and their agents
        </p>
        <h1 className="animate-rise mt-2 font-[family-name:var(--font-fraunces)] text-[clamp(3rem,10vw,5.4rem)] font-bold leading-[0.94] tracking-[-0.045em] text-matcha-deep">
          <span className="bg-[linear-gradient(120deg,#1f4a36_0%,#3a6b4f_52%,#8a6b1f_100%)] bg-clip-text text-transparent">
            HoneyMatcha
          </span>
        </h1>
        <Show when="signed-out">
          <SignedOutHero />
        </Show>
        <Show when="signed-in">
          <SignedInHero />
        </Show>
      </div>
      <div className="animate-rise-delay-2 relative mx-auto w-full max-w-[32rem] lg:max-w-none">
        <div className="pointer-events-none absolute inset-[8%] rounded-full bg-[radial-gradient(circle,rgba(232,210,154,0.55)_0%,rgba(111,154,124,0.18)_46%,transparent_70%)] blur-2xl" />
        <BrandHero className="relative z-[1] h-auto w-full drop-shadow-[0_30px_60px_rgba(31,74,54,0.16)]" />
      </div>
    </div>
  );
}
