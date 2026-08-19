import Link from "next/link";
import { CapabilityMark } from "@/components/capability-mark";
import { stateFor, type Capability } from "@/lib/capabilities";

/**
 * What this account can hand off, and what it cannot hand off yet.
 *
 * A locked tile is never hidden and never a dead end. Hiding it would mean a
 * person could use HoneyMatcha for months without learning the product does
 * four other things; a dead end would mean telling them "coming soon" when it
 * is in fact already built and running for anyone with their own agent. So a
 * locked tile shows the real capability, says which of those two situations it
 * is in, and links to the one action that changes it.
 */
export function CapabilityGrid({
  capabilities,
  agentConnected,
}: {
  capabilities: Capability[];
  agentConnected: boolean;
}) {
  const operator = agentConnected ? "own" : "sage";

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {capabilities.map((capability) => {
        const ready = stateFor(capability, operator) === "ready";
        const href = ready ? capability.href : "/app/agent";
        return (
          <li key={capability.id}>
            <Link
              href={href}
              className={`flex h-full min-h-[9.5rem] flex-col p-4 no-underline ${
                ready
                  ? "surface-card surface-card-interactive"
                  : "cap-locked rounded-2xl"
              }`}
            >
              <span
                className={ready ? "text-matcha" : "text-[#a8802c]"}
                aria-hidden="true"
              >
                <CapabilityMark
                  glyph={capability.glyph}
                  className="h-5 w-5 sm:h-6 sm:w-6"
                />
              </span>
              <span className="mt-3 block font-semibold text-ink">
                {capability.title}
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted">
                {capability.line}
              </span>
              <span
                className={`mt-auto block pt-3 text-[0.7rem] font-semibold ${
                  ready ? "text-matcha-deep" : "text-[#7a5610]"
                }`}
              >
                {ready
                  ? agentConnected
                    ? "Your agent runs this"
                    : "Sage runs this"
                  : "Connect an agent to use it"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
