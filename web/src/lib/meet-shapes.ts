/**
 * The shapes a scanned meeting can take, and nothing else.
 *
 * Split from meet.ts so the browser can render the chips without pulling the
 * database client in behind them.
 */

export const MEET_INTENTS = {
  coffee: {
    label: "Coffee",
    noun: "Coffee",
    hour: 9,
    minute: 0,
    minutes: 45,
    weekdaysOnly: true,
  },
  lunch: {
    label: "Lunch",
    noun: "Lunch",
    hour: 12,
    minute: 30,
    minutes: 60,
    weekdaysOnly: true,
  },
  drinks: {
    label: "Drinks",
    noun: "Drinks",
    hour: 18,
    minute: 30,
    minutes: 90,
    weekdaysOnly: false,
  },
  call: {
    label: "Quick call",
    // The noun titles the event ("Call: Dana & Sam"); the label sits on a chip.
    noun: "Call",
    hour: 16,
    minute: 0,
    minutes: 30,
    weekdaysOnly: true,
  },
} as const;

export type MeetIntent = keyof typeof MEET_INTENTS;

/** "connect" asks for the link only: no event, no times. */
export type MeetChoice = MeetIntent | "connect";

export function isMeetChoice(value: unknown): value is MeetChoice {
  // hasOwn, not `in`: `"toString" in MEET_INTENTS` is true, and would hand a
  // function to code that expects one of the shapes.
  return (
    value === "connect" ||
    (typeof value === "string" && Object.hasOwn(MEET_INTENTS, value))
  );
}
