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
  sageName,
}: {
  capabilities: Capability[];
  agentConnected: boolean;
  /** What this person calls the agent that came with the account. */
  sageName: string;
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
              <span className="flex-1" aria-hidden="true" />
              {/* Only when it distinguishes one tile from another. With an
                  agent connected every tile is ready, so this said "Your agent
                  runs this" five times under a heading that had just said your
                  agent runs all of these. */}
              {agentConnected ? null : (
                <span
                  className={`mt-auto block pt-3 text-[0.7rem] font-semibold ${
                    ready ? "text-matcha-deep" : "text-[#7a5610]"
                  }`}
                >
                  {ready
                    ? `${sageName} runs this`
                    : "Connect an assistant to use it"}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
