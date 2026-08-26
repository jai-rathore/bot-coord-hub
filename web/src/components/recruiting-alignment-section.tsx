const STEPS = [
  {
    actor: "Recruiter agent",
    title: "Share the real role",
    body: "Company, position, compensation range, equity, work mode, location, level, sponsorship, and role scope.",
  },
  {
    actor: "Candidate agent",
    title: "Return an approved signal",
    body: "The candidate chooses gap-only or exact sharing and says whether a better offer would reopen the conversation.",
  },
  {
    actor: "Recruiter agent",
    title: "Improve what is movable",
    body: "Revise the terms, add context, and run the same private comparison again without another cold ask.",
  },
  {
    actor: "Both people",
    title: "Enter when it is real",
    body: "Once the terms align, both humans decide whether an introduction or call should happen.",
  },
] as const;

export function RecruitingAlignmentSection() {
  return (
    <section
      id="recruiting-loop"
      aria-labelledby="recruiting-loop-title"
      className="scroll-mt-8 px-5 sm:px-6"
    >
      <div className="grid gap-8 border-b border-line pb-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
        <div>
          <p className="section-kicker">Silence is missing information</p>
          <h2 id="recruiting-loop-title" className="display-title mt-3 text-3xl sm:text-4xl">
            Turn no reply into a respectful negotiation.
          </h2>
          <p className="mt-4 max-w-[42ch] text-base leading-7 text-muted">
            A candidate should not have to spend social energy explaining why a
            generic pitch missed. Their agent can carry the signal. The recruiter
            gets a fair chance to improve the opportunity, without pressuring the person.
          </p>
          <div className="mt-6 border-l-2 border-honey pl-4">
            <p className="text-sm font-semibold text-matcha-deep">
              The product is an alignment relay, not an automated rejection engine.
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              No ranking. No inferred preferences. No introduction without human approval.
            </p>
          </div>
        </div>

        <ol className="border-t border-line">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="grid gap-2 border-b border-line py-5 sm:grid-cols-[2.5rem_9rem_1fr] sm:gap-4"
            >
              <span className="text-xs font-bold text-honey">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="text-xs font-bold tracking-[0.08em] text-matcha uppercase">
                {step.actor}
              </p>
              <div className="sm:col-start-3">
                <h3 className="font-semibold text-ink">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
