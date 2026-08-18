import Link from "next/link";

/**
 * The range story: the same product from a two-tap coffee to a private
 * recruiting pipeline. Visual weight climbs with the ambition of each rung —
 * pale and light at the bottom, a dark card at the top — so the gradient of
 * seriousness is legible before a single word is read.
 */

type Rung = {
  n: string;
  kicker: string;
  said: string;
  does: string;
  chips: string[];
  glyph: "pair" | "cluster" | "grid" | "constellation";
  tone: "honey" | "soft" | "mid" | "deep";
};

const RUNGS: Rung[] = [
  {
    n: "01",
    kicker: "Two taps, no setup",
    said: "Coffee Thursday?",
    does: "Send one link. Three people tap a time. Done before anyone opens a calendar.",
    chips: ["One link", "No agent needed"],
    glyph: "pair",
    tone: "honey",
  },
  {
    n: "02",
    kicker: "When nobody agrees",
    said: "Dinner for eight. Everyone's difficult.",
    does: "Set a deadline and a headcount. People suggest their own times, and Sage handles the side conversations so you never chase anyone.",
    chips: ["Quorum + deadline", "Sage negotiates", "You confirm"],
    glyph: "cluster",
    tone: "soft",
  },
  {
    n: "03",
    kicker: "Real work, real stakes",
    said: "Forty candidates. Twelve slots. This week.",
    does: "Offer slots that fill once each. Candidates never see each other, and the calendar invites go out the moment you approve.",
    chips: ["Blind mode", "One seat per slot", "Books on approval"],
    glyph: "grid",
    tone: "mid",
  },
  {
    n: "04",
    kicker: "People you haven't met",
    said: "Find me a co-founder in Lisbon.",
    does: "Your agent looks privately, compares what matters, and brings you a shortlist. Nobody is named until you both say yes.",
    chips: ["Rotating handles", "No public directory", "Two approvals"],
    glyph: "constellation",
    tone: "deep",
  },
];

const TONE: Record<
  Rung["tone"],
  { card: string; kicker: string; num: string; said: string; body: string; chip: string; glyph: string }
> = {
  honey: {
    card: "bg-[linear-gradient(150deg,rgba(255,255,252,0.94),rgba(249,240,215,0.85))] border-honey-soft/50",
    kicker: "text-honey",
    num: "text-honey/45",
    said: "text-matcha-deep",
    body: "text-muted",
    chip: "border-honey-soft/70 bg-white/60 text-matcha-deep",
    glyph: "text-honey/70",
  },
  soft: {
    card: "bg-[linear-gradient(150deg,rgba(255,255,252,0.94),rgba(233,243,235,0.9))] border-matcha-soft/40",
    kicker: "text-matcha",
    num: "text-matcha-soft/50",
    said: "text-matcha-deep",
    body: "text-muted",
    chip: "border-matcha-soft/50 bg-white/65 text-matcha-deep",
    glyph: "text-matcha-soft",
  },
  mid: {
    card: "bg-[linear-gradient(150deg,rgba(238,247,240,0.96),rgba(206,228,213,0.92))] border-matcha/25",
    kicker: "text-matcha-deep",
    num: "text-matcha/35",
    said: "text-matcha-deep",
    body: "text-matcha-deep/75",
    chip: "border-matcha/25 bg-white/70 text-matcha-deep",
    glyph: "text-matcha",
  },
  deep: {
    card: "bg-[linear-gradient(150deg,#1d4834_0%,#173f2e_58%,#122f22_100%)] border-matcha-deep",
    kicker: "text-honey-soft",
    num: "text-honey-soft/30",
    said: "text-[#f4f8f4]",
    body: "text-[#cfe0d3]",
    chip: "border-white/20 bg-white/10 text-[#eaf3ec]",
    glyph: "text-honey-soft/80",
  },
};

/** Glyph density tracks the scenario's complexity. */
function Glyph({ kind, className }: { kind: Rung["glyph"]; className: string }) {
  const common = {
    viewBox: "0 0 120 80",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    className,
  };
  if (kind === "pair") {
    return (
      <svg {...common}>
        <circle cx="34" cy="40" r="7" />
        <circle cx="86" cy="40" r="7" />
        <path d="M43 40h34" strokeDasharray="3 4" />
      </svg>
    );
  }
  if (kind === "cluster") {
    return (
      <svg {...common}>
        <circle cx="60" cy="40" r="9" />
        {[
          [22, 22],
          [98, 22],
          [18, 58],
          [102, 58],
          [60, 12],
          [60, 70],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r="4.5" />
            <path d={`M${x} ${y} L60 40`} strokeDasharray="2 4" opacity="0.6" />
          </g>
        ))}
      </svg>
    );
  }
  if (kind === "grid") {
    return (
      <svg {...common}>
        {Array.from({ length: 4 }).map((_, c) =>
          Array.from({ length: 3 }).map((_, r) => (
            <rect
              key={`${c}-${r}`}
              x={16 + c * 24}
              y={16 + r * 18}
              width="16"
              height="11"
              rx="2.5"
              opacity={c === 1 && r === 1 ? 1 : 0.45}
            />
          )),
        )}
        <path d="M40 27.5 L44 33 L52 21" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      {[
        [24, 26],
        [52, 16],
        [88, 24],
        [34, 58],
        [66, 46],
        [98, 60],
        [14, 44],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 4 ? 6 : 3.2} opacity={i === 4 ? 1 : 0.7} />
      ))}
      <path
        d="M24 26 L52 16 M52 16 L66 46 M66 46 L34 58 M66 46 L88 24 M88 24 L98 60 M14 44 L34 58"
        strokeDasharray="2 5"
        opacity="0.5"
      />
      <circle cx="66" cy="46" r="15" strokeDasharray="3 5" opacity="0.35" />
    </svg>
  );
}

export function HomeLadder({
  discoveryEnabled,
}: {
  discoveryEnabled: boolean;
}) {
  const rungs = discoveryEnabled
    ? RUNGS
    : RUNGS.filter((rung) => rung.glyph !== "constellation");

  return (
    <section aria-labelledby="ladder-title" className="scroll-mt-24">
      <div className="max-w-2xl">
        <p className="section-kicker">Same link, any ambition</p>
        <h2 id="ladder-title" className="display-title mt-2 text-3xl sm:text-4xl">
          Starts as a coffee. Scales to a hiring round.
        </h2>
        <p className="mt-4 text-lg leading-8 text-muted">
          You never have to learn the sophisticated version. It is the same
          link, with more switched on — and every rung still ends with a person
          deciding.
        </p>
      </div>

      <ol className="mt-12 space-y-5 sm:space-y-6">
        {rungs.map((rung, index) => {
          const tone = TONE[rung.tone];
          return (
            <li
              key={rung.n}
              className="rung-rise"
              /* Each rung steps further in, so the eye climbs on wide screens. */
              style={{ ["--rung" as string]: String(index) }}
            >
              <article
                className={`rung-card surface-card relative overflow-hidden border p-6 sm:p-8 ${tone.card}`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute -top-10 -right-6 font-[family-name:var(--font-fraunces)] text-[7rem] leading-none font-semibold select-none sm:text-[9rem] ${tone.num}`}
                >
                  {rung.n}
                </span>

                <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-10">
                  <div className="min-w-0">
                    <p
                      className={`text-[0.68rem] font-bold tracking-[0.16em] uppercase ${tone.kicker}`}
                    >
                      {rung.kicker}
                    </p>
                    <p
                      className={`mt-3 font-[family-name:var(--font-fraunces)] text-[clamp(1.5rem,3.6vw,2.15rem)] leading-[1.15] font-semibold tracking-[-0.02em] ${tone.said}`}
                    >
                      &ldquo;{rung.said}&rdquo;
                    </p>
                    <p className={`mt-4 max-w-xl text-[0.97rem] leading-7 ${tone.body}`}>
                      {rung.does}
                    </p>
                    <ul className="mt-5 flex flex-wrap gap-2">
                      {rung.chips.map((chip) => (
                        <li
                          key={chip}
                          className={`rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${tone.chip}`}
                        >
                          {chip}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rung-glyph shrink-0 self-center justify-self-start sm:justify-self-end">
                    <Glyph
                      kind={rung.glyph}
                      className={`h-16 w-24 sm:h-20 sm:w-32 ${tone.glyph}`}
                    />
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ol>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Link href="/app/events/new" className="button-primary min-h-12 px-5">
          Start with the simple one
        </Link>
        <p className="text-sm text-muted">
          You can turn the rest on later. Nothing to configure up front.
        </p>
      </div>
    </section>
  );
}
