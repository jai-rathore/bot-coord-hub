"use client";

import { useCallback, useRef, useState } from "react";

/**
 * The marketing page in one thumb-width.
 *
 * The old page said everything three times: a card grid, a four-rung ladder,
 * a trust grid, and a closing pitch — several screens of scrolling on a phone
 * before anyone reached a button. This is the same story as two swipeable
 * lanes with the one distinction that actually matters between them: what you
 * do yourself, and what an agent does once you connect one. Nobody has to
 * scroll past the agent half to find out the product works without it.
 */

type Feature = { title: string; line: string; glyph: Glyph };
type Glyph = "link" | "clock" | "tap" | "qr" | "eye" | "check" | "calendar" | "chase" | "handshake" | "search" | "shield" | "plug";

const LANES = [
  {
    id: "you" as const,
    tab: "You do it",
    tagline: "No agent. No setup. Just a link.",
    tag: "Your hands",
    features: [
      { title: "One link", line: "Drop it in the group chat.", glyph: "link" },
      { title: "A deadline", line: "It closes on time, not on the last reply.", glyph: "clock" },
      { title: "Two taps", line: "People answer without an account.", glyph: "tap" },
      { title: "Your QR code", line: "Met someone? Scan and pick a time.", glyph: "qr" },
      { title: "Names optional", line: "Show everyone, counts only, or nothing.", glyph: "eye" },
      { title: "You confirm", line: "Nothing is booked until you say yes.", glyph: "check" },
    ] satisfies Feature[],
  },
  {
    id: "agent" as const,
    tab: "Your agent does it",
    tagline: "Connect an agent and stop being the middle.",
    tag: "Agent mode",
    features: [
      { title: "Free/busy", line: "Compares calendars. Never reads titles.", glyph: "calendar" },
      { title: "Chases replies", line: "So you are not the reminder service.", glyph: "chase" },
      { title: "Agent to agent", line: "Yours settles it with theirs.", glyph: "handshake" },
      { title: "Finds people", line: "Privately. Nobody is named without consent.", glyph: "search" },
      { title: "Asks first", line: "It can never approve on your behalf.", glyph: "shield" },
      { title: "MCP and A2A", line: "Grok, Claude, or your own.", glyph: "plug" },
    ] satisfies Feature[],
  },
];

function Mark({ glyph }: { glyph: Glyph }) {
  const paths: Record<Glyph, React.ReactNode> = {
    link: <path d="M9 15l6-6M10 6l1-1a4 4 0 1 1 6 6l-1 1M14 18l-1 1a4 4 0 1 1-6-6l1-1" />,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
    tap: <><path d="M9 11V6a2 2 0 1 1 4 0v6" /><path d="M13 12V9a2 2 0 1 1 4 0v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-4.3-2.5L5 15" /></>,
    qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h3v3M20 20h-3M20 14v3" /></>,
    eye: <><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
    check: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
    chase: <path d="M4 12h11m0 0-4-4m4 4-4 4M18 5v14" />,
    handshake: <><circle cx="7" cy="10" r="3" /><circle cx="17" cy="10" r="3" /><path d="M10 10h4M9 20c0-3 1.5-4.5 3-4.5S15 17 15 20" /></>,
    search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
    shield: <><path d="M12 3.5 5 6v6c0 4.5 3 7.4 7 8.5 4-1.1 7-4 7-8.5V6l-7-2.5Z" /><path d="m9 12 2 2 4-4" /></>,
    plug: <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8ZM12 17v4" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[glyph]}
    </svg>
  );
}

export function HomeCarousel() {
  const [lane, setLane] = useState<"you" | "agent">("you");
  const [index, setIndex] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const active = LANES.find((item) => item.id === lane) ?? LANES[0];

  const syncIndex = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.firstElementChild as HTMLElement | null;
    if (!card) return;
    const step = card.offsetWidth + 12;
    setIndex(Math.round(rail.scrollLeft / step));
  }, []);

  function selectLane(next: "you" | "agent") {
    // A lane switch replaces the cards, so the rail starts over with them.
    setLane(next);
    railRef.current?.scrollTo({ left: 0 });
    setIndex(0);
  }

  function scrollBy(direction: 1 | -1) {
    const rail = railRef.current;
    const card = rail?.firstElementChild as HTMLElement | null;
    if (!rail || !card) return;
    rail.scrollBy({ left: direction * (card.offsetWidth + 12), behavior: "smooth" });
  }

  return (
    <section aria-labelledby="features-title" className="scroll-mt-24">
      <div className="px-5 sm:px-6">
        <h2 id="features-title" className="display-title text-3xl sm:text-4xl">
          Two ways to run it.
        </h2>

        <div
          role="tablist"
          aria-label="How the work gets done"
          className="mt-5 inline-flex rounded-2xl border border-line bg-white/70 p-1"
        >
          {LANES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={lane === item.id}
              aria-controls={`lane-${item.id}`}
              onClick={() => selectLane(item.id)}
              className={`min-h-11 cursor-pointer rounded-xl px-3.5 py-2 text-sm font-semibold transition sm:px-4 ${
                lane === item.id
                  ? "bg-matcha-deep text-white shadow-[0_6px_16px_rgba(23,63,46,0.16)]"
                  : "text-muted hover:text-matcha-deep"
              }`}
            >
              {item.tab}
            </button>
          ))}
        </div>

        <p className="mt-4 text-base text-muted">{active.tagline}</p>
      </div>

      <div
        id={`lane-${active.id}`}
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
          {active.features.map((feature) => (
            <article
              key={feature.title}
              className={`flex min-h-[10.5rem] flex-col justify-between rounded-2xl p-5 ${
                active.id === "you" ? "lane-you" : "lane-agent"
              }`}
            >
              <span
                className={
                  active.id === "you" ? "text-matcha" : "text-honey-soft"
                }
              >
                <Mark glyph={feature.glyph} />
              </span>
              <div className="mt-6">
                <h3
                  className={`font-[family-name:var(--font-fraunces)] text-xl font-semibold ${
                    active.id === "you" ? "text-matcha-deep" : "text-[#f4f8f4]"
                  }`}
                >
                  {feature.title}
                </h3>
                <p
                  className={`mt-1 text-sm leading-6 ${
                    active.id === "you" ? "text-muted" : "text-[#cfe0d3]"
                  }`}
                >
                  {feature.line}
                </p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3 px-5 sm:px-6">
          <div className="flex flex-1 gap-1.5" aria-hidden="true">
            {active.features.map((feature, position) => (
              <span
                key={feature.title}
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
      </div>
    </section>
  );
}
