/**
 * Wall-clock arithmetic for scanned meetings.
 *
 * Pure and database-free so the slot math can be tested directly — the DST
 * boundaries are exactly where a "9am coffee" quietly becomes 8am, and that is
 * not something to find out in production.
 */

import { MEET_INTENTS, type MeetIntent } from "@/lib/meet-shapes";

/** How many candidate times a scan seeds. Enough to land one, few enough to scan. */
const SLOT_COUNT = 4;

function offsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  // "24" appears at midnight under hour12:false in some engines.
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - utcMs;
}

/**
 * The instant at which a wall-clock time occurs in a timezone.
 *
 * Two passes because the offset depends on the answer: the first guess picks an
 * offset, and re-reading it at the corrected instant catches the DST boundaries
 * where the two disagree.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = offsetMs(guess, timeZone);
  const corrected = guess - first;
  const second = offsetMs(corrected, timeZone);
  return new Date(second === first ? corrected : guess - second);
}

function localParts(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
  };
}

export function normalizeTimezone(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
    return value.trim();
  } catch {
    return "UTC";
  }
}

/**
 * Candidate times for a freshly scanned meeting.
 *
 * Starts tomorrow: "you two met tonight" means today's 9am is already gone, and
 * offering a slot in the past is the fastest way to look broken.
 */
export function meetSlots(
  intent: MeetIntent,
  timeZone: string,
  now = new Date(),
): Array<{ startsAt: Date; endsAt: Date }> {
  const shape = MEET_INTENTS[intent];
  const slots: Array<{ startsAt: Date; endsAt: Date }> = [];

  for (let offset = 1; offset <= 21 && slots.length < SLOT_COUNT; offset += 1) {
    const probe = localParts(now.getTime() + offset * 86_400_000, timeZone);
    if (
      shape.weekdaysOnly &&
      (probe.weekday === "Sat" || probe.weekday === "Sun")
    ) {
      continue;
    }
    const startsAt = zonedTimeToUtc(
      probe.year,
      probe.month,
      probe.day,
      shape.hour,
      shape.minute,
      timeZone,
    );
    if (startsAt.getTime() <= now.getTime()) continue;
    slots.push({
      startsAt,
      endsAt: new Date(startsAt.getTime() + shape.minutes * 60_000),
    });
  }
  return slots;
}

