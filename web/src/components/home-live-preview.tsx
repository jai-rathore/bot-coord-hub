"use client";

import { useState } from "react";

const EXAMPLES = [
  {
    label: "Plan an event",
    title: "Dinner next Thursday",
    summary: "One link. Everyone shares availability.",
    steps: [
      ["You", "Plan dinner"],
      ["Agents", "Compare free time"],
      ["You", "Approve Thu · 7:00 PM"],
    ],
  },
  {
    label: "Recruiting",
    title: "Staff AI engineer",
    summary: "Role and preferences stay private.",
    steps: [
      ["Recruiter", "Shares the role"],
      ["Agents", "Check the gaps"],
      ["Both", "Approve the introduction"],
    ],
  },
  {
    label: "One-on-one",
    title: "Coffee with Mina",
    summary: "Calendars compared. Event titles stay private.",
    steps: [
      ["You", "Ask for coffee"],
      ["Agents", "Find a time"],
      ["You", "Approve Tue · 10:30 AM"],
    ],
  },
] as const;

export function HomeLivePreview() {
  const [active, setActive] = useState(0);

  const example = EXAMPLES[active];

  return (
    <figure className="relative mx-auto w-full max-w-[32rem] border-y border-matcha-soft/45 bg-white/35 px-1 py-6 sm:px-5 sm:py-8">
      <div
        className="pointer-events-none absolute -inset-10 -z-10 bg-[radial-gradient(circle,rgba(117,161,132,0.2),transparent_68%)] blur-2xl"
        aria-hidden="true"
      />
      <figcaption className="flex items-center justify-between gap-3 border-b border-line pb-4">
        <span className="section-kicker">What agents can coordinate</span>
        <span className="font-mono text-[0.68rem] font-bold text-muted">
          {String(active + 1).padStart(2, "0")} / {String(EXAMPLES.length).padStart(2, "0")}
        </span>
      </figcaption>

      <div className="py-5">
        <p className="text-xs font-bold tracking-[0.08em] text-matcha uppercase">
          {example.label}
        </p>
        <p className="mt-2 font-[family-name:var(--font-fraunces)] text-2xl font-semibold tracking-[-0.03em] text-matcha-deep">
          {example.title}
        </p>
        <p className="mt-1 text-sm leading-6 text-muted">{example.summary}</p>
      </div>

      <ol className="divide-y divide-line border-y border-line">
        {example.steps.map(([who, action]) => (
          <li
            key={`${example.label}-${who}`}
            className="grid grid-cols-[5.5rem_1fr] gap-3 py-3"
          >
            <span className="text-xs font-bold tracking-[0.06em] text-matcha uppercase">
              {who}
            </span>
            <span className="text-sm font-medium text-ink">{action}</span>
          </li>
        ))}
      </ol>

      <div aria-label="Coordination examples" className="mt-5 flex flex-wrap gap-2">
        {EXAMPLES.map((item, index) => (
          <button
            key={item.label}
            type="button"
            aria-pressed={active === index}
            onClick={() => setActive(index)}
            className={`min-h-10 rounded-full border px-3 text-xs font-semibold transition ${
              active === index
                ? "border-matcha-deep bg-matcha-deep text-white"
                : "border-line bg-white/70 text-muted hover:border-matcha-soft hover:text-matcha-deep"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </figure>
  );
}
