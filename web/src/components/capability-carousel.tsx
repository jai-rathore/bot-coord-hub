"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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

/** Matches the `gap` on `.rail`; the step maths needs it in pixels. */
const CARD_GAP = 12;

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
  const [ends, setEnds] = useState({ start: true, finish: false });
  const railRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const active = OPERATORS.find((item) => item.id === operator) ?? OPERATORS[0];
  const locked = lockedCount(CAPABILITIES);

  /**
   * A flick fires scroll events faster than the screen refreshes, and reading
   * `offsetWidth` inside one forces the browser to lay the page out again
   * before it can answer. Doing that per event is what makes a rail feel like
   * it is catching on something, so the work is coalesced into one animation
   * frame and skipped entirely while a frame is already pending.
   */
  const syncIndex = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const rail = railRef.current;
      const card = rail?.firstElementChild as HTMLElement | null;
      if (!rail || !card) return;
      const cardStep = card.offsetWidth + CARD_GAP;
      const remaining = rail.scrollWidth - rail.clientWidth - rail.scrollLeft;
      const start = rail.scrollLeft <= 1;
      const finish = remaining <= 1;
      setEnds({ start, finish });

      /**
       * Where the rail runs out, several cards share the last scroll position,
       * and dividing by a card width claims you are on the first of them. Both
       * ends are pinned to the card you can actually see arriving.
       */
      const position = finish
        ? CAPABILITIES.length - 1
        : start
          ? 0
          : Math.round(rail.scrollLeft / cardStep);
      setIndex(Math.min(CAPABILITIES.length - 1, Math.max(0, position)));
    });
  }, []);

  useEffect(() => {
    // A wide window can show the whole rail at once, which means "next" has
    // nowhere to go before anyone has scrolled. Measure once on arrival, and
    // again whenever a resize changes how many cards fit.
    syncIndex();
    window.addEventListener("resize", syncIndex, { passive: true });
    return () => {
      window.removeEventListener("resize", syncIndex);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [syncIndex]);

  function selectOperator(next: Operator) {
    // The cards stay put across a switch — only their state changes — so the
    // rail keeps its position and the person sees the same card light up.
    setOperator(next);
  }

  function step(direction: 1 | -1) {
    const rail = railRef.current;
    if (!rail) return;
    const target = rail.children[
      Math.min(CAPABILITIES.length - 1, Math.max(0, index + direction))
    ] as HTMLElement | undefined;
    if (!target) return;

    /**
     * Scroll to the card itself, never by a pixel step.
     *
     * The rail snaps `mandatory`, so a smooth scroll that comes to rest between
     * two snap points gets hauled to the nearest one the moment it lands — the
     * visible jerk at the end of the glide. Handing the browser a real element
     * means the destination is already a snap point. The alignment has to match
     * the CSS (`center` on a phone, `start` from 640px) or the same fight
     * happens at the two ends of the rail.
     */
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
      inline: window.matchMedia("(min-width: 640px)").matches
        ? "start"
        : "center",
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
              <span key={capability.id} className="h-1 w-5 overflow-hidden">
                <span
                  className={`block h-full w-full rounded-full transition-[transform,background-color] duration-300 ${
                    position === index
                      ? "scale-x-100 bg-matcha"
                      : "scale-x-[0.3] bg-line"
                  }`}
                />
              </span>
            ))}
          </div>
          <div className="hidden gap-2 sm:flex">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={ends.start}
              aria-label="Previous"
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-line bg-white/70 text-matcha-deep transition-opacity disabled:cursor-default disabled:opacity-35"
            >
              <span aria-hidden="true">&larr;</span>
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={ends.finish}
              aria-label="Next"
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-line bg-white/70 text-matcha-deep transition-opacity disabled:cursor-default disabled:opacity-35"
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
