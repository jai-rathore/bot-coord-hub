"use client";

import Link from "next/link";
import {
  Show,
  SignInButton,
  SignUpButton,
  useUser,
} from "@clerk/nextjs";

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
      <p className="animate-rise-delay-1 mt-3 max-w-[28ch] font-[family-name:var(--font-fraunces)] text-[clamp(1.2rem,3.4vw,1.5rem)] font-semibold leading-[1.3] tracking-[-0.015em] text-ink">
        {name ? `Welcome back, ${name}` : "Welcome back"}
      </p>
      <p className="animate-rise-delay-2 mt-2 max-w-[38ch] text-[1.02rem] text-muted">
        Your agent handles the back-and-forth. You step in only when needed.
      </p>
      <ul className="animate-rise-delay-3 mt-5 m-0 grid list-none gap-2.5 p-0">
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
      <div className="animate-rise-delay-3 mt-5">
        <Link
          href="/app"
          className="inline-flex items-center justify-center rounded-md border border-matcha-deep bg-matcha-deep px-[1.05rem] py-[0.7rem] text-[0.95rem] font-semibold text-[#f7faf6] no-underline transition hover:-translate-y-px hover:border-matcha hover:bg-matcha hover:text-[#f7faf6]"
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
      <p className="animate-rise-delay-1 mt-3 max-w-[28ch] font-[family-name:var(--font-fraunces)] text-[clamp(1.2rem,3.4vw,1.5rem)] font-semibold leading-[1.3] tracking-[-0.015em] text-ink">
        Let your agent handle the back-and-forth.
      </p>
      <p className="animate-rise-delay-2 mt-2 max-w-[38ch] text-[1.02rem] text-muted">
        Tell your agent what needs to happen. HoneyMatcha helps it coordinate
        with other people, their agents, and people without agents.
      </p>
      <div className="animate-rise-delay-3 mt-5 flex flex-wrap gap-3">
        <SignUpButton mode="redirect">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center justify-center rounded-md border border-matcha-deep bg-matcha-deep px-[1.05rem] py-[0.7rem] text-[0.95rem] font-semibold text-[#f7faf6] transition hover:-translate-y-px hover:border-matcha hover:bg-matcha"
          >
            Connect my agent
          </button>
        </SignUpButton>
        <SignInButton mode="redirect">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center justify-center rounded-md border border-line bg-transparent px-[1.05rem] py-[0.7rem] text-[0.95rem] font-semibold text-matcha-deep transition hover:-translate-y-px hover:border-matcha-soft hover:bg-[rgba(255,252,246,0.55)]"
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
    <div className="relative z-0 mx-auto w-[min(40rem,calc(100%-2rem))] px-0 pb-10 pt-6 sm:pb-12 sm:pt-8">
      <h1 className="animate-rise font-[family-name:var(--font-fraunces)] text-[clamp(2.5rem,9vw,3.6rem)] font-bold leading-[1.02] tracking-[-0.03em] text-matcha-deep">
        <span className="bg-[linear-gradient(120deg,#1f4a36_0%,#3a6b4f_55%,#8a6b1f_100%)] bg-clip-text text-transparent">
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
  );
}
