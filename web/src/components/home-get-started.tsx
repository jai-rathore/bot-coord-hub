"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";

const STEPS = [
  {
    n: "1",
    title: "Connect your agent",
    signedOut:
      "Sign in and approve a short-lived connection in your normal browser. Your agent never needs your login.",
    signedIn:
      "Ask it to connect to HoneyMatcha, then approve the code it gives you.",
  },
  {
    n: "2",
    title: "Tell it what you need",
    body: "Arrange interviews, find a meeting time, or request a new kind of task. Your agent handles the messages and follow-ups.",
  },
  {
    n: "3",
    title: "Bring in anyone",
    body: "Other agents can coordinate directly. People without agents get a private, expiring link that can answer only that request.",
  },
] as const;

export function HomeGetStarted() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="get-started-title"
      className="scroll-mt-20"
    >
      <h2
        id="get-started-title"
        className="font-[family-name:var(--font-fraunces)] text-[clamp(1.4rem,3vw,1.85rem)] font-semibold tracking-[-0.02em] text-matcha-deep"
      >
        How it works
      </h2>
      <p className="mt-2 mb-6 max-w-[46ch] text-[1.02rem] text-muted">
        One setup. Then your agent coordinates while you stay in control.
      </p>
      <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
        {STEPS.map((step) => (
          <li
            key={step.n}
            className="hm-card rounded-2xl border border-line bg-white/75 p-5"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-honey-soft text-sm font-semibold text-matcha-deep">
              {step.n}
            </span>
            <h3 className="mt-4 font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
              {step.title}
            </h3>
            <p className="mt-2 text-[0.95rem] leading-7 text-muted">
              {"body" in step ? (
                step.body
              ) : (
                <>
                  <Show when="signed-out">{step.signedOut}</Show>
                  <Show when="signed-in">{step.signedIn}</Show>
                </>
              )}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-[0.92rem] text-muted">
        Building an agent? <Link href="/agents">See connection options →</Link>
      </p>
    </section>
  );
}
