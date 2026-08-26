import Link from "next/link";
import { CapabilityMark } from "@/components/capability-mark";
import { CAPABILITIES } from "@/lib/capabilities";

const AGENT_CHOICES = [
  {
    label: "Included with your account",
    title: "Use Sage",
    body: "Sage is included for planning, scheduling, and recruiting. You keep every final decision.",
  },
  {
    label: "Optional",
    title: "Bring your own agent",
    body: "Connect ChatGPT, Claude, Gemini, Grok, Cursor, or any MCP-compatible agent. The same approval rules apply.",
  },
] as const;

export function CapabilityOverview() {
  return (
    <section aria-labelledby="capabilities-title" className="px-5 sm:px-6">
      <div className="grid gap-8 border-b border-line pb-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div>
          <p className="section-kicker">Choose your agent</p>
          <h2
            id="capabilities-title"
            className="display-title mt-3 text-3xl sm:text-4xl"
          >
            One coordination layer. Two ways to use it.
          </h2>
          <p className="mt-4 max-w-[46ch] text-base leading-7 text-muted">
            Sage and connected agents work with other people&apos;s agents through
            HoneyMatcha. Everyone can use a different assistant. The rules stay
            the same, and every final decision stays with a person.
          </p>
        </div>

        <div className="divide-y divide-line border-y border-line">
          {AGENT_CHOICES.map((choice) => (
            <div
              key={choice.title}
              className="grid gap-2 py-5 sm:grid-cols-[9.5rem_1fr] sm:gap-5"
            >
              <p className="text-xs font-bold tracking-[0.08em] text-matcha uppercase">
                {choice.label}
              </p>
              <div>
                <h3 className="font-semibold text-ink">{choice.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {choice.body}
                </p>
                {choice.title === "Bring your own agent" ? (
                  <Link
                    href="/agents"
                    className="mt-2 inline-flex min-h-11 items-center py-2 text-sm font-semibold text-matcha-deep"
                  >
                    See connection steps <span aria-hidden="true">→</span>
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker">What agents can coordinate</p>
            <h3 className="display-title mt-2 text-2xl sm:text-3xl">
              One place for the coordination work.
            </h3>
          </div>
          <p className="max-w-sm text-sm leading-6 text-muted">
            These are capabilities, not links. Choose your starting point after
            you sign in.
          </p>
        </div>

        <div className="mt-6 grid border-t border-line md:grid-cols-2">
          {CAPABILITIES.map((capability, index) => (
            <article
              key={capability.id}
              className={`grid grid-cols-[2.5rem_1fr] gap-3 border-b border-line py-5 md:px-5 ${
                index % 2 === 0 ? "md:border-r md:pl-0" : "md:pr-0"
              }`}
            >
              <span className="mt-0.5 text-matcha" aria-hidden="true">
                <CapabilityMark glyph={capability.glyph} />
              </span>
              <div>
                <h4 className="font-semibold text-ink">{capability.title}</h4>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {capability.line}
                </p>
                <span className="mt-2 inline-flex rounded-full border border-line bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-muted">
                  {capability.availability === "ready"
                    ? "Available"
                    : "Coming soon"}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
