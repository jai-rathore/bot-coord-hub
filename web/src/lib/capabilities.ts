/**
 * What HoneyMatcha can coordinate, and who is allowed to run it.
 *
 * The product is not "an events app with an optional agent". Every capability
 * here is run by an agent: the only question is whose. Sage is the one we
 * provide and it is already switched on; a connected agent (ChatGPT, Claude,
 * Gemini, Grok, Cursor, or anything speaking MCP or A2A) can use the same
 * underlying capability boundary.
 *
 * Readiness lives in one list that both the signed-out page and signed-in home
 * use, so product copy cannot accidentally promise a path Sage cannot run.
 */

export type Operator = "sage" | "own";

/** Where a capability stands for a given operator. */
export type CapabilityState = "ready" | "soon";

export type Glyph =
  | "calendar"
  | "handshake"
  | "search"
  | "pin"
  | "briefcase";

export type Capability = {
  id: string;
  title: string;
  /** What it does, in the words someone would use out loud. */
  line: string;
  /** Sage runs this one today, or is still learning it. */
  sage: CapabilityState;
  /** Where a signed-in person goes to use it. */
  href: string;
  /** The env flag that hides it from a signed-in person, if any. */
  flag?: "events" | "discovery";
  glyph: Glyph;
};

export const CAPABILITIES: Capability[] = [
  {
    id: "events",
    title: "Group events",
    line: "One link, one deadline. Everyone picks a time without an account.",
    sage: "ready",
    href: "/app/events/new",
    flag: "events",
    glyph: "calendar",
  },
  {
    id: "meet",
    title: "Meet one-on-one",
    line: "Calendars compared for you. Free/busy only: never event titles.",
    sage: "ready",
    href: "/app/agent",
    glyph: "handshake",
  },
  {
    id: "intro",
    title: "Introductions",
    line: "Put in touch with someone new, only once you both say yes.",
    sage: "ready",
    href: "/app/discovery",
    flag: "discovery",
    glyph: "search",
  },
  {
    id: "hiring",
    title: "Hiring matches",
    line: "Compare what a role and a candidate need before either is named.",
    sage: "ready",
    href: "/app/discovery",
    flag: "discovery",
    glyph: "briefcase",
  },
  {
    id: "meetup",
    title: "Local meetups",
    line: "Find people nearby who want the same thing on the same evening.",
    sage: "ready",
    href: "/app/discovery",
    flag: "discovery",
    glyph: "pin",
  },
];

/**
 * Connected agents can run everything; Sage runs every ready capability.
 *
 * This is the one rule the whole model rests on, so it is a function rather
 * than a field: nothing else is allowed to invent a third answer.
 */
export function stateFor(
  capability: Capability,
  operator: Operator,
): CapabilityState {
  return operator === "own" ? "ready" : capability.sage;
}

/** Capabilities a signed-in person can actually reach right now. */
export function enabledCapabilities(flags: {
  events: boolean;
  discovery: boolean;
}): Capability[] {
  return CAPABILITIES.filter((capability) =>
    capability.flag ? flags[capability.flag] : true,
  );
}

/** How many capabilities connecting an agent would unlock, for a nudge. */
export function lockedCount(capabilities: Capability[]): number {
  return capabilities.filter((capability) => capability.sage === "soon").length;
}
