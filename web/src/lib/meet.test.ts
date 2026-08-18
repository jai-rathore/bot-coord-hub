import test from "node:test";
import assert from "node:assert/strict";

import { isMeetChoice, MEET_INTENTS } from "./meet-shapes";
import { meetSlots, normalizeTimezone, zonedTimeToUtc } from "./meet-time";

/** What a person in `tz` would read off a clock at this instant. */
function wallClock(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function weekday(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(date);
}

test("a wall-clock time resolves to the right instant in a zone", () => {
  // 09:00 in New York on a summer date is 13:00 UTC (EDT, UTC-4).
  assert.equal(
    zonedTimeToUtc(2026, 7, 15, 9, 0, "America/New_York").toISOString(),
    "2026-07-15T13:00:00.000Z",
  );
  // The same wall-clock in winter is 14:00 UTC (EST, UTC-5).
  assert.equal(
    zonedTimeToUtc(2026, 1, 15, 9, 0, "America/New_York").toISOString(),
    "2026-01-15T14:00:00.000Z",
  );
  // A zone with a half-hour offset must not be rounded to the hour.
  assert.equal(
    zonedTimeToUtc(2026, 7, 15, 9, 0, "Asia/Kolkata").toISOString(),
    "2026-07-15T03:30:00.000Z",
  );
});

test("slots keep their wall-clock hour across a DST change", () => {
  // US clocks go forward on 8 March 2026; slots either side must both read 09:00.
  const now = new Date("2026-03-05T12:00:00.000Z");
  const slots = meetSlots("coffee", "America/New_York", now);
  assert.ok(slots.length > 0);
  for (const slot of slots) {
    assert.equal(wallClock(slot.startsAt, "America/New_York"), "09:00");
  }
  // If the offset had been applied blindly, every slot would share one offset.
  const offsets = new Set(
    slots.map((slot) => slot.startsAt.getTime() % 86_400_000),
  );
  assert.ok(offsets.size > 1, "expected the UTC instant to shift across DST");
});

test("every seeded slot is in the future and correctly spaced", () => {
  const now = new Date("2026-08-18T22:30:00.000Z");
  for (const intent of Object.keys(MEET_INTENTS) as Array<
    keyof typeof MEET_INTENTS
  >) {
    const slots = meetSlots(intent, "Europe/London", now);
    assert.equal(slots.length, 4, `${intent} should seed four times`);
    for (const slot of slots) {
      assert.ok(
        slot.startsAt.getTime() > now.getTime(),
        `${intent} offered a slot in the past`,
      );
      assert.equal(
        slot.endsAt.getTime() - slot.startsAt.getTime(),
        MEET_INTENTS[intent].minutes * 60_000,
      );
    }
    // Distinct days, in order.
    const times = slots.map((slot) => slot.startsAt.getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
    assert.equal(new Set(times).size, times.length);
  }
});

test("weekday-only shapes skip the weekend, drinks does not", () => {
  // A Friday: the next days are Sat and Sun.
  const friday = new Date("2026-08-21T20:00:00.000Z");
  for (const slot of meetSlots("coffee", "Europe/London", friday)) {
    const day = weekday(slot.startsAt, "Europe/London");
    assert.ok(day !== "Sat" && day !== "Sun", `coffee landed on ${day}`);
  }
  const drinkDays = meetSlots("drinks", "Europe/London", friday).map((slot) =>
    weekday(slot.startsAt, "Europe/London"),
  );
  assert.ok(
    drinkDays.some((day) => day === "Sat" || day === "Sun"),
    "drinks should be happy on a weekend",
  );
});

test("an unusable timezone falls back rather than throwing", () => {
  assert.equal(normalizeTimezone("Mars/Olympus"), "UTC");
  assert.equal(normalizeTimezone(""), "UTC");
  assert.equal(normalizeTimezone(undefined), "UTC");
  assert.equal(normalizeTimezone("Asia/Tokyo"), "Asia/Tokyo");
});

test("only the known shapes are accepted", () => {
  assert.equal(isMeetChoice("coffee"), true);
  assert.equal(isMeetChoice("connect"), true);
  assert.equal(isMeetChoice("dinner"), false);
  assert.equal(isMeetChoice(""), false);
  assert.equal(isMeetChoice(null), false);
  // Prototype keys must not pass the `in` check.
  assert.equal(isMeetChoice("toString"), false);
  assert.equal(isMeetChoice("constructor"), false);
});
