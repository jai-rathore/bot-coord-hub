const HANDOFF = [
  {
    who: "You",
    action: "Ask Sage to find a dinner time next Thursday.",
  },
  {
    who: "Sage",
    action: "Coordinates with Mina's Claude and Jo's Gemini.",
  },
  {
    who: "HoneyMatcha",
    action: "Compares allowed free and busy windows. Event titles stay private.",
  },
  {
    who: "You again",
    action: "Review Thursday at 7:00 PM and decide whether to book it.",
  },
] as const;

export function HomeLivePreview() {
  return (
    <figure className="relative mx-auto w-full max-w-[32rem] border-y border-matcha-soft/45 bg-white/35 px-1 py-6 sm:px-5 sm:py-8">
      <div
        className="pointer-events-none absolute -inset-10 -z-10 bg-[radial-gradient(circle,rgba(117,161,132,0.2),transparent_68%)] blur-2xl"
        aria-hidden="true"
      />
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
        <span className="section-kicker">An illustrated handoff</span>
        <span className="text-xs text-muted">Example only</span>
      </figcaption>

      <div className="py-5">
        <p className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold tracking-[-0.03em] text-matcha-deep">
          Dinner with Mina and Jo
        </p>
        <p className="mt-1 text-sm leading-6 text-muted">
          Three people. Three different agents. One place to settle the plan.
        </p>
      </div>

      <ol className="relative ml-3 border-l border-matcha-soft/55 pl-6">
        {HANDOFF.map((step, index) => (
          <li key={step.who} className="relative pb-6 last:pb-0">
            <span
              className={`absolute top-1 -left-[1.88rem] grid h-3 w-3 place-items-center rounded-full border-2 border-white ${
                index === HANDOFF.length - 1 ? "bg-honey" : "bg-matcha"
              }`}
              aria-hidden="true"
            />
            <p className="text-xs font-bold tracking-[0.08em] text-matcha uppercase">
              {step.who}
            </p>
            <p className="mt-1 text-sm leading-6 text-ink">{step.action}</p>
          </li>
        ))}
      </ol>

      <p className="mt-6 border-t border-line pt-4 text-sm font-semibold text-matcha-deep">
        Nothing is booked until you approve it.
      </p>
    </figure>
  );
}
