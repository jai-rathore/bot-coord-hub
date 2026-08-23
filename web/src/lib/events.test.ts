import assert from "node:assert/strict";
import test from "node:test";

import {
  quorumSatisfied,
  resolveDimension,
  scoreOptions,
  type ResolvableOption,
  type ResolvableVote,
} from "./events/resolve";
import {
  eventShareDescription,
  projectBoard,
  PUBLIC_EVENT_DESCRIPTION,
  type BoardSource,
} from "./events/board";
import { displayName } from "./events/copy";
import { relativeDeadline, statusSummary } from "./events/copy";
import { MIN_COUNT_DISCLOSURE } from "./events/types";

/* ------------------------------------------------------------------ */
/* resolution                                                          */
/* ------------------------------------------------------------------ */

function opt(
  id: string,
  position: number,
  extra: Partial<ResolvableOption> = {},
): ResolvableOption {
  return {
    id,
    position,
    status: "active",
    capacity: null,
    startsAt: null,
    ...extra,
  };
}

function votes(...pairs: Array<[string, "yes" | "no" | "maybe"]>): ResolvableVote[] {
  return pairs.map(([optionId, value]) => ({ optionId, value }));
}

test("score is yes + half a maybe", () => {
  const scores = scoreOptions(
    [opt("a", 0)],
    votes(["a", "yes"], ["a", "yes"], ["a", "maybe"], ["a", "no"]),
  );
  assert.equal(scores[0].yes, 2);
  assert.equal(scores[0].maybe, 1);
  assert.equal(scores[0].no, 1);
  assert.equal(scores[0].score, 2.5);
});

test("withdrawn options are excluded from scoring", () => {
  const scores = scoreOptions(
    [opt("a", 0), opt("b", 1, { status: "withdrawn" })],
    votes(["a", "yes"], ["b", "yes"]),
  );
  assert.equal(scores.length, 1);
  assert.equal(scores[0].optionId, "a");
});

test("highest score wins", () => {
  const outcome = resolveDimension(
    [opt("a", 0), opt("b", 1)],
    votes(["a", "yes"], ["b", "yes"], ["b", "yes"]),
    null,
  );
  assert.equal(outcome.winner?.optionId, "b");
  assert.equal(outcome.reason, "resolved");
});

test("yes count breaks a score tie ahead of maybes", () => {
  // a: 2 yes = 2.0   b: 1 yes + 2 maybe = 2.0
  const outcome = resolveDimension(
    [opt("a", 0), opt("b", 1)],
    votes(
      ["a", "yes"],
      ["a", "yes"],
      ["b", "yes"],
      ["b", "maybe"],
      ["b", "maybe"],
    ),
    null,
  );
  assert.equal(outcome.winner?.optionId, "a");
});

test("fewer calendar conflicts breaks a full tie", () => {
  const outcome = resolveDimension(
    [opt("a", 0, { conflicts: 3 }), opt("b", 1, { conflicts: 0 })],
    votes(["a", "yes"], ["b", "yes"]),
    null,
  );
  assert.equal(outcome.winner?.optionId, "b");
});

test("organizer preference breaks a tie when conflicts match", () => {
  const outcome = resolveDimension(
    [opt("a", 0, { organizerPref: null }), opt("b", 1, { organizerPref: "yes" })],
    votes(["a", "yes"], ["b", "yes"]),
    null,
  );
  assert.equal(outcome.winner?.optionId, "b");
});

test("earliest start breaks a tie before position", () => {
  const outcome = resolveDimension(
    [
      opt("a", 0, { startsAt: new Date("2026-09-02T10:00:00Z") }),
      opt("b", 1, { startsAt: new Date("2026-09-01T10:00:00Z") }),
    ],
    votes(["a", "yes"], ["b", "yes"]),
    null,
  );
  assert.equal(outcome.winner?.optionId, "b");
});

test("resolution is stable: identical data always gives the same winner", () => {
  const options = [opt("a", 0), opt("b", 1), opt("c", 2)];
  const cast = votes(["a", "yes"], ["b", "yes"], ["c", "yes"]);
  const first = resolveDimension(options, cast, null).winner?.optionId;
  for (let i = 0; i < 20; i += 1) {
    assert.equal(resolveDimension(options, cast, null).winner?.optionId, first);
  }
  assert.equal(first, "a", "lowest position is the final tie-break");
});

test("quorum filters out options that cannot reach it", () => {
  const outcome = resolveDimension(
    [opt("a", 0), opt("b", 1)],
    votes(["a", "yes"], ["a", "yes"], ["b", "yes"]),
    2,
  );
  assert.equal(outcome.winner?.optionId, "a");
  assert.equal(outcome.quorumMet, true);
});

test("quorum unmet everywhere reports quorum_not_met and no winner", () => {
  const outcome = resolveDimension(
    [opt("a", 0), opt("b", 1)],
    votes(["a", "yes"], ["b", "yes"]),
    4,
  );
  assert.equal(outcome.winner, null);
  assert.equal(outcome.quorumMet, false);
  assert.equal(outcome.reason, "quorum_not_met");
});

test("options over capacity are ineligible", () => {
  const outcome = resolveDimension(
    [opt("a", 0, { capacity: 1 }), opt("b", 1)],
    votes(["a", "yes"], ["a", "yes"], ["b", "yes"]),
    null,
  );
  assert.equal(outcome.winner?.optionId, "b");
});

test("no options and no responses are distinct outcomes", () => {
  assert.equal(resolveDimension([], [], null).reason, "no_options");
  assert.equal(resolveDimension([opt("a", 0)], [], null).reason, "no_responses");
});

test("quorumSatisfied only fires when a quorum was actually configured", () => {
  const outcome = resolveDimension([opt("a", 0)], votes(["a", "yes"]), null);
  assert.equal(quorumSatisfied(outcome, null), false);
  assert.equal(quorumSatisfied(outcome, 1), true);
  assert.equal(quorumSatisfied(outcome, 5), false);
});

/* ------------------------------------------------------------------ */
/* board projection + visibility                                       */
/* ------------------------------------------------------------------ */

const ORGANIZER = "11111111-1111-1111-1111-111111111111";
const ALICE = "22222222-2222-2222-2222-222222222222";
const BOB = "33333333-3333-3333-3333-333333333333";
const CARA = "44444444-4444-4444-4444-444444444444";

function source(
  visibility: "open" | "counts_only" | "blind",
  responderIds: string[] = [ALICE, BOB],
): BoardSource {
  const deadline = new Date("2099-01-01T00:00:00Z");
  const people = [
    { id: "p-org", userId: ORGANIZER, name: "Jai", role: "organizer" },
    { id: "p-alice", userId: ALICE, name: "Alice", role: "invitee" },
    { id: "p-bob", userId: BOB, name: "Bob", role: "invitee" },
    { id: "p-cara", userId: CARA, name: "Cara", role: "invitee" },
  ];
  return {
    event: {
      id: "e1",
      publicId: "pub-1",
      shareSlug: "slug1",
      organizerUserId: ORGANIZER,
      sessionId: null,
      title: "Coffee",
      description: null,
      timezone: "UTC",
      status: "open",
      visibility,
      lockPolicy: "at_deadline",
      quorumMin: null,
      capacityMax: null,
      deadlineAt: deadline,
      lockedAt: null,
      confirmedAt: null,
      cancelledAt: null,
      agentMode: "hosted",
      agentName: "Sage",
      allowChat: true,
      allowGuestOptions: true,
      outcome: {},
      notesDigest: null,
      notesDigestKey: null,
      notesDigestAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    } as BoardSource["event"],
    organizerName: "Jai",
    dimensions: [
      {
        id: "d-time",
        eventId: "e1",
        kind: "time",
        label: "When",
        mode: "open",
        resolutionRule: "max_attendance",
        resolvedOptionId: null,
        dependsOnDimensionId: null,
        position: 1,
        createdAt: new Date(),
      } as BoardSource["dimensions"][number],
    ],
    options: [
      {
        id: "o1",
        eventId: "e1",
        dimensionId: "d-time",
        startsAt: new Date("2026-09-01T17:00:00Z"),
        endsAt: null,
        label: null,
        placeRef: {},
        capacity: null,
        createdByRole: "organizer",
        createdByUserId: ORGANIZER,
        status: "active",
        position: 0,
        createdAt: new Date(),
      } as BoardSource["options"][number],
    ],
    participants: people.map(
      (p) =>
        ({
          participant: {
            id: p.id,
            eventId: "e1",
            userId: p.userId,
            role: p.role,
            attendance: responderIds.includes(p.userId) ? "yes" : "pending",
            chatTurnsUsed: 0,
            source: "share_link",
            joinedAt: new Date(),
            lastSeenAt: null,
            respondedAt: responderIds.includes(p.userId) ? new Date() : null,
          },
          name: p.name,
        }) as BoardSource["participants"][number],
    ),
    responses: responderIds.map(
      (userId, index) =>
        ({
          id: `r${index}`,
          eventId: "e1",
          participantId: people.find((p) => p.userId === userId)!.id,
          dimensionId: "d-time",
          optionId: "o1",
          value: "yes",
          note: null,
          source: "ui",
          createdAt: new Date(),
          updatedAt: new Date(),
        }) as BoardSource["responses"][number],
    ),
    notes: [],
  };
}

test("no board payload ever serializes an email address", () => {
  // Regression: users.name is nullable and the share page is public, so a
  // `name || email` fallback published the organizer's address to anyone
  // holding the link. Names must degrade to a local part, never an address.
  const nameless = source("open");
  nameless.organizerName = displayName(null, "jai@example.com", "The organizer");
  nameless.participants = nameless.participants.map((p) => ({
    ...p,
    name: displayName(null, `${p.participant.userId}@example.com`),
  }));

  for (const viewer of [ORGANIZER, ALICE, BOB, null]) {
    const payload = JSON.stringify(projectBoard(nameless, viewer));
    assert.equal(
      payload.includes("@"),
      false,
      `viewer ${viewer ?? "public"} received an email address`,
    );
  }
  assert.equal(nameless.organizerName, "jai");
});

test("displayName never returns a full address", () => {
  assert.equal(displayName("Jai Rathore", "jai@example.com"), "Jai Rathore");
  assert.equal(displayName(null, "jai@example.com"), "jai");
  assert.equal(displayName("   ", "jai@example.com"), "jai");
  assert.equal(displayName(null, null), "Someone");
  assert.equal(displayName(null, null, "The organizer"), "The organizer");
  for (const value of [
    displayName(null, "a.b+tag@sub.example.co.uk"),
    displayName(null, "jai@example.com"),
  ]) {
    assert.equal(value.includes("@"), false);
  }
});

test("a suppressed board discloses no aggregate anywhere in its payload", () => {
  // Regression: `quorum.leadingYes` and `quorum.met` were computed from full
  // data and returned ungated, so a blind event leaked its own tally in the
  // JSON even though the UI never rendered it.
  for (const mode of ["blind", "counts_only"] as const) {
    const board = projectBoard(source(mode), BOB);
    assert.equal(board.countsSuppressed, true, mode);
    assert.equal(board.counts.joined, null, mode);
    assert.equal(board.counts.responded, null, mode);
    assert.equal(board.leader, null, mode);
    assert.equal(board.quorum.met, null, `${mode}: quorum.met must be null`);
    assert.equal(
      board.quorum.leadingYes,
      null,
      `${mode}: quorum.leadingYes must be null`,
    );
    for (const dimension of board.dimensions) {
      for (const option of dimension.options) {
        assert.equal(option.yes, null, mode);
        assert.equal(option.maybe, null, mode);
        assert.equal(option.no, null, mode);
        assert.equal(option.score, null, mode);
        assert.equal(option.voters, null, mode);
      }
    }
  }
});

test("no suppressed board serializes another participant's name", () => {
  // Scans the whole payload rather than named fields, so a field added later
  // cannot reintroduce the leak unnoticed.
  for (const mode of ["blind", "counts_only"] as const) {
    const payload = JSON.stringify(projectBoard(source(mode), BOB));
    assert.equal(payload.includes("Alice"), false, `${mode} leaked Alice`);
    assert.equal(
      payload.includes(ALICE),
      false,
      `${mode} leaked Alice's user id`,
    );
  }
});

test("the viewer still sees their own answers when others are hidden", () => {
  // Suppression must hide other people, not break the page for the viewer.
  const board = projectBoard(source("blind"), ALICE);
  const mine = board.dimensions
    .flatMap((d) => d.options)
    .filter((o) => o.mine !== null);
  assert.ok(mine.length > 0, "the viewer must still see their own preference");
  assert.equal(board.viewer.role, "participant");
  assert.equal(board.viewer.hasResponded, true);
});

test("organizer sees names and counts under every visibility mode", () => {
  for (const mode of ["open", "counts_only", "blind"] as const) {
    const board = projectBoard(source(mode), ORGANIZER);
    assert.equal(board.viewer.role, "organizer", mode);
    assert.ok(board.participants, `${mode}: organizer must see the roster`);
    assert.equal(board.counts.responded, 2, mode);
    assert.equal(board.dimensions[0].options[0].yes, 2, mode);
    assert.equal(board.countsSuppressed, false, mode);
  }
});

test("open mode discloses voter names to participants", () => {
  const board = projectBoard(source("open"), ALICE);
  assert.equal(board.viewer.role, "participant");
  assert.ok(board.participants);
  assert.deepEqual(
    board.dimensions[0].options[0].voters?.map((v) => v.name),
    ["Alice", "Bob"],
  );
});

test("counts_only hides names but keeps aggregates", () => {
  const board = projectBoard(source("counts_only", [ALICE, BOB, CARA]), ALICE);
  assert.equal(board.participants, null, "roster must be hidden");
  assert.equal(board.dimensions[0].options[0].voters, null);
  assert.equal(board.dimensions[0].options[0].yes, 3);
});

test("counts_only suppresses counts below the disclosure floor", () => {
  assert.equal(MIN_COUNT_DISCLOSURE, 3);
  const board = projectBoard(source("counts_only", [ALICE, BOB]), ALICE);
  assert.equal(board.countsSuppressed, true, "2 responders would leak identity");
  assert.equal(board.dimensions[0].options[0].yes, null);
  assert.equal(board.counts.responded, null);
  assert.equal(board.leader, null);
});

test("blind hides everything except the viewer's own answer", () => {
  const board = projectBoard(source("blind", [ALICE, BOB, CARA]), ALICE);
  assert.equal(board.countsSuppressed, true);
  assert.equal(board.participants, null);
  assert.equal(board.dimensions[0].options[0].yes, null);
  assert.equal(board.dimensions[0].options[0].voters, null);
  assert.equal(
    board.dimensions[0].options[0].mine,
    "yes",
    "the viewer must still see their own response",
  );
});

test("share-card description stays generic unless the event is open", () => {
  assert.equal(
    eventShareDescription({
      visibility: "blind",
      description: "Confidential offsite at the lake house",
    }),
    PUBLIC_EVENT_DESCRIPTION,
  );
  assert.equal(
    eventShareDescription({
      visibility: "counts_only",
      description: "Confidential offsite at the lake house",
    }),
    PUBLIC_EVENT_DESCRIPTION,
  );
  assert.equal(
    eventShareDescription({
      visibility: "open",
      description: "Coffee on Thursday",
    }),
    "Coffee on Thursday",
  );
  assert.equal(
    eventShareDescription({ visibility: "open", description: null }),
    PUBLIC_EVENT_DESCRIPTION,
  );
});

test("atCapacity does not leak raw yes counts under blind or counts_only", () => {
  const src = source("blind", [ALICE, BOB, CARA]);
  src.options[0] = { ...src.options[0], capacity: 2 };
  const participant = projectBoard(src, ALICE);
  assert.equal(participant.dimensions[0].options[0].yes, null);
  assert.equal(
    participant.dimensions[0].options[0].atCapacity,
    false,
    "capacity from hidden tallies must stay hidden",
  );

  const organizer = projectBoard(src, ORGANIZER);
  assert.equal(organizer.dimensions[0].options[0].yes, 3);
  assert.equal(organizer.dimensions[0].options[0].atCapacity, true);
});

test("a signed-out visitor is public, sees no own-answer, and cannot respond", () => {
  const board = projectBoard(source("open"), null);
  assert.equal(board.viewer.role, "public");
  assert.equal(board.viewer.participantId, null);
  assert.equal(board.viewer.canRespond, false);
  assert.equal(board.dimensions[0].options[0].mine, null);
});

test("a signed-in participant may respond while the event is open", () => {
  const board = projectBoard(source("open"), ALICE);
  assert.equal(board.viewer.canRespond, true);
  assert.equal(board.viewer.hasResponded, true);
});

test("responding is closed once the deadline has passed", () => {
  const src = source("open");
  const board = projectBoard(src, ALICE, new Date("2100-01-01T00:00:00Z"));
  assert.equal(board.viewer.canRespond, false);
});

test("responding is closed once the event is locked", () => {
  const src = source("open");
  src.event = { ...src.event, status: "locked" };
  const board = projectBoard(src, ALICE);
  assert.equal(board.viewer.canRespond, false);
});

test("a signed-in non-participant sees the public view but may respond", () => {
  // The exact state every share-link recipient is in the moment after they
  // sign in. Responding joins them, so the buttons must be live: gating on
  // participant role left real recipients staring at a dead board.
  const src = source("open");
  src.participants = src.participants.filter(
    (p) => p.participant.userId !== CARA,
  );
  const board = projectBoard(src, CARA);
  assert.equal(board.viewer.role, "public");
  assert.equal(board.viewer.canRespond, true);
  assert.equal(board.viewer.participantId, null);
});

test("an anonymous viewer can never respond", () => {
  const board = projectBoard(source("open"), null);
  assert.equal(board.viewer.role, "public");
  assert.equal(board.viewer.canRespond, false);
});

test("the summary never leaks counts the viewer may not see", () => {
  const blind = projectBoard(source("blind", [ALICE, BOB, CARA]), ALICE);
  assert.match(blind.summary, /private/i);
  assert.doesNotMatch(blind.summary, /\d+ of \d+/);

  const organizer = projectBoard(source("blind", [ALICE, BOB, CARA]), ORGANIZER);
  assert.match(organizer.summary, /3 of 4 responded/);
});

/* ------------------------------------------------------------------ */
/* copy                                                                */
/* ------------------------------------------------------------------ */

test("relative deadline reads in the largest sensible unit", () => {
  const now = new Date("2026-08-18T00:00:00Z");
  assert.equal(
    relativeDeadline(new Date("2026-08-18T00:30:00Z"), now),
    "closes in 30m",
  );
  assert.equal(
    relativeDeadline(new Date("2026-08-18T06:00:00Z"), now),
    "closes in 6h",
  );
  assert.equal(
    relativeDeadline(new Date("2026-08-22T00:00:00Z"), now),
    "closes in 4d",
  );
  assert.equal(
    relativeDeadline(new Date("2026-08-17T00:00:00Z"), now),
    "closed",
  );
});

test("terminal states get their own summary rather than a countdown", () => {
  const deadlineAt = new Date("2026-08-20T00:00:00Z");
  const base = {
    responded: 3,
    joined: 5,
    leadingLabel: "Tue 6pm",
    deadlineAt,
    quorumRequired: null,
    quorumMet: true,
    countsHidden: false,
  };
  assert.match(statusSummary({ ...base, status: "confirmed" }), /Confirmed/);
  assert.match(statusSummary({ ...base, status: "locked" }), /Locked in/);
  assert.match(statusSummary({ ...base, status: "cancelled" }), /cancelled/);
  assert.match(
    statusSummary({
      ...base,
      status: "expired",
      quorumRequired: 4,
      quorumMet: false,
    }),
    /4 were needed/,
  );
});
