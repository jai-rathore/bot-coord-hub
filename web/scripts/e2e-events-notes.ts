/**
 * End-to-end for event notes — the shared layer.
 *
 * Runs against a real database, without Clerk, in the same style as
 * e2e-events.ts. What it is really checking is the disclosure contract: who
 * can read a note, who can take one down, and that a private board never
 * turns a note into a side channel around its own visibility setting.
 *
 *   DATABASE_URL=... npm run test:e2e-events-notes
 */

import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { eventOptions, users } from "../src/db/schema";
import {
  createEvent,
  joinEvent,
  publishNote,
  removeNoteAndRefresh,
  retractNoteAndRefresh,
} from "../src/lib/events/service";
import { loadBoardSource, projectBoard } from "../src/lib/events/board";
import { NOTE_LIMITS } from "../src/lib/events/notes";
import { notesDigestKey } from "../src/lib/events/notes-digest";

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}

async function expectReject(label: string, fn: () => Promise<unknown>) {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  assert.equal(threw, true, `expected rejection: ${label}`);
  ok(label);
}

async function board(eventId: string, viewerId: string | null) {
  const source = await loadBoardSource(eventId);
  assert.ok(source, "board source missing");
  return projectBoard(source, viewerId);
}

async function main() {
  const db = getDb();
  const suffix = randomBytes(4).toString("hex");

  const mkUser = async (tag: string, name: string) => {
    const [row] = await db
      .insert(users)
      .values({
        clerkUserId: `clerk_${tag}_${suffix}`,
        email: `${tag}_${suffix}@example.com`,
        name,
      })
      .returning();
    return row;
  };

  const organizer = await mkUser("org", "Organizer");
  const alice = await mkUser("alice", "Alice");
  const bob = await mkUser("bob", "Bob");

  const soon = Date.now() + 72 * 3600_000;
  const slots = [
    { startsAt: new Date(soon + 24 * 3600_000).toISOString() },
    { startsAt: new Date(soon + 48 * 3600_000).toISOString() },
  ];

  console.log("\n1. Open board: a note reaches everyone on the event");
  const event = await createEvent(organizer, {
    title: `Coffee ${suffix}`,
    timezone: "UTC",
    visibility: "open",
    deadlineAt: new Date(soon).toISOString(),
    slots,
  });
  const aliceP = await joinEvent(event, alice);
  await joinEvent(event, bob);

  const options = await db
    .select()
    .from(eventOptions)
    .where(eq(eventOptions.eventId, event.id));
  const friday = options.find((option) => option.startsAt !== null)!;

  const { note: shared, notice } = await publishNote({
    event,
    user: alice,
    participant: aliceP,
    input: {
      body: "Can't do Friday — intern last-day lunch.",
      visibility: "everyone",
      optionId: friday.id,
      source: "chat",
    },
  });
  assert.equal(shared.visibility, "everyone");
  assert.equal(notice, null, "an open board keeps the requested audience");
  ok("Alice's note was stored for everyone");

  const bobSees = await board(event.id, bob.id);
  assert.equal(bobSees.notes.length, 1);
  assert.equal(bobSees.notes[0].authorName, "Alice");
  assert.equal(bobSees.notes[0].isMine, false);
  assert.equal(bobSees.notes[0].canRetract, false, "Bob cannot retract Alice's");
  assert.equal(bobSees.notes[0].canRemove, false, "Bob is not the organizer");
  assert.ok(bobSees.notes[0].optionLabel, "the note names the option it is about");
  ok("Bob reads it, attributed, and cannot touch it");

  const aliceSees = await board(event.id, alice.id);
  assert.equal(aliceSees.notes[0].isMine, true);
  assert.equal(aliceSees.notes[0].canRetract, true);
  ok("Alice sees it as hers and can take it back");

  const organizerSees = await board(event.id, organizer.id);
  assert.equal(organizerSees.notes[0].canRemove, true);
  ok("the organizer can remove it");

  // Without GEMINI_API_KEY the model digest is skipped, and the section still
  // has to say something true. That fallback is the contract being checked.
  assert.ok(
    bobSees.notesSummary,
    "the section needs a rollup even with no model configured",
  );
  assert.equal(
    bobSees.notesDigestIsLive,
    Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY),
    "notesDigestIsLive must reflect whether a model actually wrote it",
  );
  ok(`rollup present: "${bobSees.notesSummary}"`);

  console.log("\n2. A signed-out visitor gets prose from nobody");
  const publicBoard = await board(event.id, null);
  assert.equal(publicBoard.notes.length, 0, "notes must not reach the public view");
  assert.equal(publicBoard.notesSummary, null);
  assert.equal(publicBoard.canPostNote, false);
  ok("the share link exposes tallies, never other people's words");

  // But a signed-in invitee who has not answered yet does read them — the
  // reason Friday is out is what they need in order to answer at all.
  const carol = await mkUser("carol", "Carol");
  const notJoined = await board(event.id, carol.id);
  assert.equal(notJoined.viewer.role, "public", "she has not joined yet");
  assert.equal(notJoined.notes.length, 1, "and still reads the shared note");
  assert.equal(notJoined.canPostNote, true, "and may add one, which joins her");
  ok("a signed-in invitee reads the notes before they have answered");

  console.log("\n3. Organizer-only notes stay with the organizer");
  const { note: privateNote } = await publishNote({
    event,
    user: alice,
    participant: aliceP,
    input: {
      body: "Is this coming out of the team budget?",
      visibility: "organizer",
      source: "chat",
    },
  });
  assert.equal(privateNote.visibility, "organizer");

  const bobAgain = await board(event.id, bob.id);
  assert.equal(bobAgain.notes.length, 1, "Bob must not see a note meant for the organizer");
  assert.ok(
    !bobAgain.notes.some((note) => note.body.includes("budget")),
    "the private body must not leak into another participant's board",
  );
  const orgAgain = await board(event.id, organizer.id);
  assert.equal(orgAgain.notes.length, 2, "the organizer sees both");
  const aliceAgain = await board(event.id, alice.id);
  assert.equal(aliceAgain.notes.length, 2, "the author still sees what they wrote");
  ok("only the organizer and the author read an organizer-only note");

  console.log("\n4. A private board refuses to be a side channel");
  const blind = await createEvent(organizer, {
    title: `Blind ${suffix}`,
    timezone: "UTC",
    visibility: "blind",
    deadlineAt: new Date(soon).toISOString(),
    slots,
  });
  const blindAliceP = await joinEvent(blind, alice);
  await joinEvent(blind, bob);

  const blindResult = await publishNote({
    event: blind,
    user: alice,
    participant: blindAliceP,
    input: { body: "Friday is out for me.", visibility: "everyone", source: "ui" },
  });
  assert.equal(
    blindResult.note.visibility,
    "organizer",
    "a blind board downgrades a note meant for everyone",
  );
  assert.ok(blindResult.notice, "and says so, rather than downgrading silently");

  const blindBob = await board(blind.id, bob.id);
  assert.equal(blindBob.notes.length, 0, "no prose crosses a blind board");
  ok("a note cannot walk around the organizer's privacy setting");

  console.log("\n5. Taking notes down");
  await expectReject("Bob cannot retract Alice's note", () =>
    retractNoteAndRefresh({ event, user: bob, noteId: shared.id }),
  );
  await expectReject("a participant cannot use the organizer's removal", () =>
    removeNoteAndRefresh({ event, user: bob, noteId: shared.id }),
  );

  await retractNoteAndRefresh({ event, user: alice, noteId: privateNote.id });
  const afterRetract = await board(event.id, organizer.id);
  assert.equal(afterRetract.notes.length, 1, "a retracted note leaves the board");
  ok("the author's retraction removes it everywhere");

  await removeNoteAndRefresh({ event, user: organizer, noteId: shared.id });
  const afterRemove = await board(event.id, bob.id);
  assert.equal(afterRemove.notes.length, 0);
  assert.equal(
    afterRemove.notesSummary,
    null,
    "the rollup must not describe notes that are gone",
  );
  ok("the organizer's removal clears the board and the summary");

  console.log("\n6. Limits and the digest cache key");
  const spam = await createEvent(organizer, {
    title: `Spam ${suffix}`,
    timezone: "UTC",
    deadlineAt: new Date(soon).toISOString(),
    slots,
  });
  const spamP = await joinEvent(spam, alice);
  for (let i = 0; i < NOTE_LIMITS.perAuthor; i += 1) {
    await publishNote({
      event: spam,
      user: alice,
      participant: spamP,
      input: { body: `note ${i}`, source: "ui" },
    });
  }
  await expectReject(`a ${NOTE_LIMITS.perAuthor + 1}th note from one person is refused`, () =>
    publishNote({
      event: spam,
      user: alice,
      participant: spamP,
      input: { body: "one too many", source: "ui" },
    }),
  );

  const bobP = await joinEvent(event, bob);
  await expectReject("an empty note is refused", () =>
    publishNote({
      event,
      user: bob,
      participant: bobP,
      input: { body: "   ", source: "ui" },
    }),
  );

  assert.equal(notesDigestKey([]), "empty");
  assert.equal(notesDigestKey(["a", "b"]), notesDigestKey(["a", "b"]));
  assert.notEqual(notesDigestKey(["a", "b"]), notesDigestKey(["b", "a"]));
  ok("the digest key is stable for a set and changes when the set does");

  console.log("\n7. A note attached to a bogus option is not attached at all");
  const [foreignOption] = await db
    .select()
    .from(eventOptions)
    .where(eq(eventOptions.eventId, blind.id));
  const stray = await publishNote({
    event,
    user: bob,
    participant: bobP,
    input: {
      body: "Attaching this to someone else's option id.",
      // A real option id, but on a different event.
      optionId: foreignOption.id,
      source: "chat",
    },
  });
  assert.equal(stray.note.optionId, null, "a foreign option id is dropped");
  ok("an option id from another event cannot be borrowed");

  console.log("\nAll note checks passed.\n");
  process.exit(0);
}

main().catch((error) => {
  console.error("\ne2e-events-notes failed:", error);
  process.exit(1);
});
