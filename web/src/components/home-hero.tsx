"use client";

import Link from "next/link";
import {
  Show,
  SignInButton,
  SignUpButton,
  useUser,
} from "@clerk/nextjs";
import { CopyBlock } from "@/components/copy-block";
import { ASK_AGENT_PROMPT } from "@/lib/connect-copy";

function SignedInHero() {
  const { user } = useUser();
  const name = user?.firstName?.trim();

  return (
    <>
      <p className="animate-rise-delay-1 mt-3 max-w-[28ch] font-[family-name:var(--font-fraunces)] text-[clamp(1.2rem,3.4vw,1.5rem)] font-semibold leading-[1.3] tracking-[-0.015em] text-ink">
        {name ? `Welcome back, ${name}` : "Welcome back"}
      </p>
      <p className="animate-rise-delay-2 mt-2 max-w-[42ch] text-[1.02rem] text-muted">
        Finish setup in HoneyMatcha, then talk to your agent. This site is
        where you approve things — your agent does the work.
      </p>
      <div className="animate-rise-delay-3 mt-5">
        <Link
          href="/app"
          className="inline-flex items-center justify-center rounded-md border border-matcha-deep bg-matcha-deep px-[1.05rem] py-[0.7rem] text-[0.95rem] font-semibold text-[#f7faf6] no-underline transition hover:-translate-y-px hover:border-matcha hover:bg-matcha hover:text-[#f7faf6]"
        >
          Continue setup
        </Link>
      </div>
    </>
  );
}

function SignedOutHero() {
  return (
    <>
      <p className="animate-rise-delay-1 mt-3 max-w-[22ch] font-[family-name:var(--font-fraunces)] text-[clamp(1.2rem,3.4vw,1.5rem)] font-semibold leading-[1.3] tracking-[-0.015em] text-ink">
        A coordination platform for you and your personal agent.
      </p>
      <p className="animate-rise-delay-2 mt-2 max-w-[42ch] text-[1.02rem] text-muted">
        Not a chat app. Not a message board. You sign in here. Your agent
        connects once. Then it can schedule meetings and work with other
        people — while you approve the important parts.
      </p>
      <div className="animate-rise-delay-3 mt-5 flex flex-wrap gap-3">
        <SignUpButton mode="redirect">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center justify-center rounded-md border border-matcha-deep bg-matcha-deep px-[1.05rem] py-[0.7rem] text-[0.95rem] font-semibold text-[#f7faf6] transition hover:-translate-y-px hover:border-matcha hover:bg-matcha"
          >
            Create account
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
      <div className="animate-rise-delay-3 mt-6 max-w-[42ch]">
        <p className="text-sm font-medium text-ink">
          After you sign up, tell your agent:
        </p>
        <div className="mt-2">
          <CopyBlock text={ASK_AGENT_PROMPT} />
        </div>
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
