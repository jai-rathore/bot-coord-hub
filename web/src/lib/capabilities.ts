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
  /** Whether HoneyMatcha exposes this workflow as a finished product today. */
  availability: CapabilityState;
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
    title: "Plan an event",
    line: "One link for one or more people to choose a time.",
    availability: "ready",
    sage: "ready",
    href: "/app/events/new",
    flag: "events",
    glyph: "calendar",
  },
  {
    id: "meet",
    title: "Meet one-on-one",
    line: "Calendars compared for you. Free/busy only: never event titles.",
    availability: "ready",
    sage: "ready",
    href: "/app/agent",
    glyph: "handshake",
  },
  {
    id: "intro",
    title: "Dating",
    line: "Private, approval-first introductions.",
    availability: "soon",
    sage: "soon",
    href: "/app/discovery",
    flag: "discovery",
    glyph: "search",
  },
  {
    id: "hiring",
    title: "Recruiting alignment",
    line: "Surface why outreach missed, revise the role, and introduce people only after the terms align.",
    availability: "ready",
    sage: "ready",
    href: "/app/recruiting",
    glyph: "briefcase",
  },
  {
    id: "meetup",
    title: "Local meetups",
    line: "Find people nearby who want the same thing on the same evening.",
    availability: "soon",
    sage: "soon",
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
  if (capability.availability === "soon") return "soon";
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
  return capabilities.filter(
    (capability) =>
      capability.availability === "ready" && capability.sage === "soon",
  ).length;
}
