"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { CapabilityMark } from "@/components/capability-mark";
import {
  CAPABILITIES,
  lockedCount,
  stateFor,
  type Operator,
} from "@/lib/capabilities";

/**
 * The whole product model in one thumb-flick.
 *
 * The rail this replaced split the page by *what kind of work* happens — you
 * do it, or an agent does it — which quietly said the agent was an add-on. It
 * is not. Every capability is run by an agent; the switch above the rail asks
 * the only question that matters, which is whose. Flipping to "my own agent"
 * turns four dimmed cards live, and that single change of state explains the
 * offer better than a paragraph could.
 */

const OPERATORS: Array<{
  id: Operator;
  tab: string;
  tagline: string;
}> = [
  {
    id: "sage",
    tab: "Sage runs it",
    tagline:
      "Sage is our agent. It is already switched on — nothing to install, nothing to pay for.",
  },
  {
    id: "own",
    tab: "My agent runs it",
    tagline:
      "Bring Grok, Claude, Cursor, or your own. It runs every capability here from day one.",
  },
];

export function CapabilityCarousel() {
  const [operator, setOperator] = useState<Operator>("sage");
  const [index, setIndex] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const active = OPERATORS.find((item) => item.id === operator) ?? OPERATORS[0];
  const locked = lockedCount(CAPABILITIES);

  const syncIndex = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.firstElementChild as HTMLElement | null;
    if (!card) return;
    const step = card.offsetWidth + 12;
    setIndex(Math.round(rail.scrollLeft / step));
  }, []);

  function selectOperator(next: Operator) {
    // The cards stay put across a switch — only their state changes — so the
    // rail keeps its position and the person sees the same card light up.
    setOperator(next);
  }

  function scrollBy(direction: 1 | -1) {
    const rail = railRef.current;
    const card = rail?.firstElementChild as HTMLElement | null;
    if (!rail || !card) return;
    rail.scrollBy({
      left: direction * (card.offsetWidth + 12),
      behavior: "smooth",
    });
  }

  return (
    <section aria-labelledby="capabilities-title" className="scroll-mt-24">
      <div className="px-5 sm:px-6">
        <h2 id="capabilities-title" className="display-title text-3xl sm:text-4xl">
          Everything here is run by an agent.
        </h2>
        <p className="mt-3 max-w-[46ch] text-base leading-7 text-muted">
          The only question is whose. Try the switch.
        </p>

        <div
          role="tablist"
          aria-label="Who runs it"
          className="mt-5 inline-flex rounded-2xl border border-line bg-white/70 p-1"
        >
          {OPERATORS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={operator === item.id}
              aria-controls={`operator-${item.id}`}
              onClick={() => selectOperator(item.id)}
              className={`min-h-11 cursor-pointer rounded-xl px-3.5 py-2 text-sm font-semibold transition sm:px-4 ${
                operator === item.id
                  ? "bg-matcha-deep text-white shadow-[0_6px_16px_rgba(23,63,46,0.16)]"
                  : "text-muted hover:text-matcha-deep"
              }`}
            >
              {item.tab}
            </button>
          ))}
        </div>

        <p className="mt-4 max-w-[52ch] text-base leading-7 text-muted">
          {active.tagline}
        </p>
      </div>

      <div
        id={`operator-${active.id}`}
        role="tabpanel"
        aria-label={active.tab}
        className="mt-6"
      >
        <div
          ref={railRef}
          onScroll={syncIndex}
          className="rail px-5 sm:px-6"
          tabIndex={0}
          aria-label={`${active.tab} — swipe for more`}
        >
          {CAPABILITIES.map((capability) => {
            const state = stateFor(capability, operator);
            const ready = state === "ready";
            return (
              <article
                key={capability.id}
                className={`flex min-h-[11.5rem] flex-col justify-between rounded-2xl p-5 transition-opacity duration-300 ${
                  operator === "own" ? "lane-agent" : "lane-you"
                } ${ready ? "" : "cap-dimmed"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={
                      operator === "own"
                        ? "text-honey-soft"
                        : ready
                          ? "text-matcha"
                          : "text-[#a8802c]"
                    }
                  >
                    <CapabilityMark glyph={capability.glyph} />
                  </span>
                  <span
                    className={`lane-tag ${ready ? "" : "cap-tag-soon"}`}
                  >
                    {ready ? "Ready" : "Sage is learning"}
                  </span>
                </div>
                <div className="mt-6">
                  <h3
                    className={`font-[family-name:var(--font-fraunces)] text-xl font-semibold ${
                      operator === "own" ? "text-[#f4f8f4]" : "text-matcha-deep"
                    }`}
                  >
                    {capability.title}
                  </h3>
                  <p
                    className={`mt-1 text-sm leading-6 ${
                      operator === "own" ? "text-[#cfe0d3]" : "text-muted"
                    }`}
                  >
                    {capability.line}
                  </p>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-3 px-5 sm:px-6">
          <div className="flex flex-1 gap-1.5" aria-hidden="true">
            {CAPABILITIES.map((capability, position) => (
              <span
                key={capability.id}
                className={`h-1 rounded-full transition-all duration-300 ${
                  position === index ? "w-5 bg-matcha" : "w-1.5 bg-line"
                }`}
              />
            ))}
          </div>
          <div className="hidden gap-2 sm:flex">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label="Previous"
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-line bg-white/70 text-matcha-deep"
            >
              <span aria-hidden="true">&larr;</span>
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label="Next"
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-line bg-white/70 text-matcha-deep"
            >
              <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>

        {/* The point of the switch, said out loud for anyone who did not flip
            it. "Coming soon" on its own loses people; "coming soon, unless you
            already have an agent" converts them. */}
        <p
          className="mt-5 px-5 text-sm leading-6 text-muted sm:px-6"
          aria-live="polite"
        >
          {operator === "sage" ? (
            <>
              {locked} of these are still on Sage&apos;s list — but none of them
              are waiting on us.{" "}
              <Link href="/agents" className="font-semibold text-matcha-deep">
                Connect your own agent
              </Link>{" "}
              and every one works today.
            </>
          ) : (
            <>
              Anything speaking MCP or A2A works.{" "}
              <Link href="/docs" className="font-semibold text-matcha-deep">
                See how to connect one
              </Link>{" "}
              — it takes one browser approval.
            </>
          )}
        </p>
      </div>
    </section>
  );
}
