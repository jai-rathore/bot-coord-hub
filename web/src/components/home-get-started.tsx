"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";

export function HomeGetStarted() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="get-started-title"
      className="mb-10 scroll-mt-6"
    >
      <h2
        id="get-started-title"
        className="font-[family-name:var(--font-fraunces)] text-[1.2rem] font-semibold tracking-[-0.01em] text-matcha-deep"
      >
        How it works
      </h2>
      <p className="mt-2 mb-4 text-[0.95rem] text-muted">
        One setup. Then your agent coordinates while you stay in control.
      </p>
      <ol className="m-0 grid list-none gap-3 p-0">
        <li className="grid grid-cols-[auto_1fr] gap-3">
          <span className="mt-0.5 grid h-[1.55rem] w-[1.55rem] place-items-center rounded-full bg-honey-soft text-[0.78rem] font-semibold text-matcha-deep">
            1
          </span>
          <span>
            <Show when="signed-out">
              <strong className="font-semibold text-ink">
                Connect your agent.
              </strong>{" "}
              Sign in and approve a short-lived connection in your normal
              browser. Your agent never needs your login.
            </Show>
            <Show when="signed-in">
              <strong className="font-semibold text-ink">
                Connect your agent.
              </strong>{" "}
              Ask it to connect to HoneyMatcha, then approve the code it gives
              you.
            </Show>
          </span>
        </li>
        <li className="grid grid-cols-[auto_1fr] gap-3">
          <span className="mt-0.5 grid h-[1.55rem] w-[1.55rem] place-items-center rounded-full bg-honey-soft text-[0.78rem] font-semibold text-matcha-deep">
            2
          </span>
          <span>
            <strong className="font-semibold text-ink">
              Tell it what you need.
            </strong>{" "}
            Arrange interviews, find a meeting time, or request a new kind of
            task. Your agent handles the messages and follow-ups.
          </span>
        </li>
        <li className="grid grid-cols-[auto_1fr] gap-3">
          <span className="mt-0.5 grid h-[1.55rem] w-[1.55rem] place-items-center rounded-full bg-honey-soft text-[0.78rem] font-semibold text-matcha-deep">
            3
          </span>
          <span>
            <strong className="font-semibold text-ink">
              Bring in anyone.
            </strong>{" "}
            Other agents can coordinate directly. People without agents get a
            private, expiring link that can answer only that request.
          </span>
        </li>
      </ol>
      <p className="mt-4 text-[0.92rem] text-muted">
        Building an agent? <Link href="/agents">See connection options →</Link>
      </p>
    </section>
  );
}
