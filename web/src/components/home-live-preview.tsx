const ALIGNMENT = [
  { label: "Company", state: "Open", tone: "neutral" },
  { label: "Role scope", state: "Needs revision", tone: "gap" },
  { label: "Compensation", state: "Needs revision", tone: "gap" },
  { label: "Equity", state: "Needs revision", tone: "gap" },
  { label: "Location", state: "Aligned", tone: "aligned" },
] as const;

export function HomeLivePreview() {
  return (
    <figure className="relative mx-auto w-full max-w-[32rem] border-y border-matcha-soft/45 bg-white/35 px-1 py-6 sm:px-5 sm:py-8">
      <div
        className="pointer-events-none absolute -inset-10 -z-10 bg-[radial-gradient(circle,rgba(117,161,132,0.2),transparent_68%)] blur-2xl"
        aria-hidden="true"
      />
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
        <span className="section-kicker">Private alignment memo</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span className="live-dot bg-honey" /> Revisable
        </span>
      </figcaption>

      <div className="py-5">
        <p className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold tracking-[-0.03em] text-matcha-deep">
          Staff AI Infrastructure Engineer
        </p>
        <p className="mt-1 text-sm leading-6 text-muted">
          Candidate-approved signal · exact expectations stay private
        </p>
      </div>

      <ul className="divide-y divide-line border-y border-line">
        {ALIGNMENT.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-3 py-3">
            <span className="text-sm font-medium text-ink">{item.label}</span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                item.tone === "aligned"
                  ? "bg-matcha-soft/18 text-matcha-deep"
                  : item.tone === "gap"
                    ? "bg-honey-soft/40 text-matcha-deep"
                    : "bg-white text-muted"
              }`}
            >
              {item.state}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-matcha-soft/35 bg-matcha-soft/9 p-4">
        <span className="text-matcha" aria-hidden="true">↻</span>
        <div>
          <p className="text-sm font-semibold text-matcha-deep">
            Recruiter can improve three terms
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Update the role, re-check alignment, then ask both people before an introduction.
          </p>
        </div>
      </div>
    </figure>
  );
}
