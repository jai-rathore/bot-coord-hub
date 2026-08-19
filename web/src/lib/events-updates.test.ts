import assert from "node:assert/strict";
import test from "node:test";

import {
  eventsForDashboard,
  namelessUpdateCopy,
  pickFeaturedEvent,
  unreadBadgeLabel,
  unreadRecipientUpdates,
  type ActivitySignal,
  type EventWithUpdates,
} from "./events/updates";

function at(iso: string): Date {
  return new Date(iso);
}

function row(
  kind: string,
  actorUserId: string | null,
  createdAt: string,
): ActivitySignal {
  return { kind, actorUserId, createdAt: at(createdAt) };
}

test("unread ignores the viewer's own activity and non-recipient kinds", () => {
  const result = unreadRecipientUpdates(
    [
      row("created", "org", "2026-08-01T10:00:00Z"),
      row("joined", "org", "2026-08-01T10:00:01Z"),
      row("responded", "guest", "2026-08-02T12:00:00Z"),
      row("locked", "org", "2026-08-03T09:00:00Z"),
    ],
    "org",
    null,
  );
  assert.equal(result.unreadCount, 1);
  assert.equal(result.latestKind, "responded");
});

test("unread starts after lastSeenAt; null lastSeen counts every other update", () => {
  const activity = [
    row("joined", "a", "2026-08-10T10:00:00Z"),
    row("responded", "a", "2026-08-11T10:00:00Z"),
    row("question_asked", "b", "2026-08-12T10:00:00Z"),
  ];

  const all = unreadRecipientUpdates(activity, "org", null);
  assert.equal(all.unreadCount, 3);
  assert.equal(all.latestKind, "question_asked");

  const afterJoin = unreadRecipientUpdates(
    activity,
    "org",
    at("2026-08-10T12:00:00Z"),
  );
  assert.equal(afterJoin.unreadCount, 2);
  assert.equal(afterJoin.latestKind, "question_asked");

  const caughtUp = unreadRecipientUpdates(
    activity,
    "org",
    at("2026-08-12T10:00:00Z"),
  );
  assert.equal(caughtUp.unreadCount, 0);
  assert.equal(caughtUp.latestKind, null);
});

test("nameless copy never echoes a joined summary name", () => {
  assert.equal(namelessUpdateCopy("responded"), "Someone answered");
  assert.equal(namelessUpdateCopy("option_added"), "Someone suggested a time");
  assert.equal(namelessUpdateCopy("joined"), "Someone opened the event");
  assert.equal(namelessUpdateCopy("question_asked"), "There's a new question");
  assert.doesNotMatch(namelessUpdateCopy("joined"), /opened the event\./);
});

test("badge says New for one update and a count after that", () => {
  assert.equal(unreadBadgeLabel(0), "");
  assert.equal(unreadBadgeLabel(1), "New");
  assert.equal(unreadBadgeLabel(2), "2 updates");
});

function fakeEvent(
  extra: Partial<EventWithUpdates> & Pick<EventWithUpdates, "id" | "title">,
): EventWithUpdates {
  return {
    organizerUserId: "org",
    shareSlug: extra.id,
    status: "open",
    deadlineAt: at("2026-08-20T12:00:00Z"),
    createdAt: at("2026-08-01T12:00:00Z"),
    unreadCount: 0,
    latestUpdate: null,
    latestUpdateAt: null,
    href: `/app/events/${extra.id}`,
    description: null,
    timezone: "UTC",
    visibility: "open",
    lockPolicy: "at_deadline",
    quorumMin: null,
    capacityMax: null,
    allowChat: true,
    updatedAt: at("2026-08-01T12:00:00Z"),
    ...extra,
  } as EventWithUpdates;
}

test("featured event prefers the one with the most unread updates", () => {
  const quiet = fakeEvent({ id: "quiet", title: "Coffee with the crew" });
  const lunch = fakeEvent({
    id: "lunch",
    title: "Lunch Date ?",
    unreadCount: 2,
    latestUpdate: "Someone answered",
    latestUpdateAt: at("2026-08-18T18:00:00Z"),
  });
  const older = fakeEvent({
    id: "older",
    title: "Older unread",
    unreadCount: 1,
    latestUpdate: "Someone opened the event",
    latestUpdateAt: at("2026-08-17T18:00:00Z"),
  });

  assert.equal(pickFeaturedEvent([quiet, lunch, older])?.id, "lunch");
  assert.equal(pickFeaturedEvent([quiet])?.id, "quiet");
  assert.equal(pickFeaturedEvent([]), null);
});

test("dashboard list surfaces unread events first and caps the strip", () => {
  const events = [
    fakeEvent({ id: "a", title: "A", createdAt: at("2026-08-03T00:00:00Z") }),
    fakeEvent({
      id: "b",
      title: "B",
      unreadCount: 1,
      latestUpdateAt: at("2026-08-18T00:00:00Z"),
      createdAt: at("2026-08-01T00:00:00Z"),
    }),
    fakeEvent({ id: "c", title: "C", createdAt: at("2026-08-02T00:00:00Z") }),
    fakeEvent({ id: "d", title: "D", createdAt: at("2026-08-04T00:00:00Z") }),
  ];
  const shown = eventsForDashboard(events, 3);
  assert.deepEqual(
    shown.map((event) => event.id),
    ["b", "d", "a"],
  );
});
