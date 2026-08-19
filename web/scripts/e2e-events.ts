import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  eventOptions,
  eventParticipants,
  events,
  notificationOutbox,
  users,
} from "../src/db/schema";
import {
  addOption,
  archiveEvent,
  assertOrganizer,
  cancelEvent,
  createEvent,
  deleteEvent,
  joinEvent,
  listEventsForUser,
  lockEvent,
  rotateShareSlug,
  setResponses,
} from "../src/lib/events/service";
import { loadBoardSource, projectBoard } from "../src/lib/events/board";
import {
  listEventsWithUpdates,
  markEventSeen,
} from "../src/lib/events/updates";

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

  const [organizer] = await db
    .insert(users)
    .values({
      clerkUserId: `clerk_org_${suffix}`,
      email: `org_${suffix}@example.com`,
      name: "Organizer",
    })
    .returning();
  const [alice] = await db
    .insert(users)
    .values({
      clerkUserId: `clerk_alice_${suffix}`,
      email: `alice_${suffix}@example.com`,
      name: "Alice",
    })
    .returning();
  const [bob] = await db
    .insert(users)
    .values({
      clerkUserId: `clerk_bob_${suffix}`,
      email: `bob_${suffix}@example.com`,
      name: "Bob",
    })
    .returning();
  const [mallory] = await db
    .insert(users)
    .values({
      clerkUserId: `clerk_mal_${suffix}`,
      email: `mal_${suffix}@example.com`,
      name: "Mallory",
    })
    .returning();

  console.log("\n1. Create a time-poll event");
  const soon = Date.now() + 72 * 3600_000;
  const event = await createEvent(organizer, {
    title: `Coffee ${suffix}`,
    description: "Testing the whole loop",
    place: "Blue Bottle",
    timezone: "UTC",
    visibility: "open",
    quorumMin: 2,
    deadlineAt: new Date(soon).toISOString(),
    slots: [
      { startsAt: new Date(soon + 24 * 3600_000).toISOString() },
      { startsAt: new Date(soon + 48 * 3600_000).toISOString() },
    ],
  });
  assert.ok(event.shareSlug.length >= 10, "share slug must be unguessable");
  ok(`created with slug /e/${event.shareSlug}`);

  const options = await db
    .select()
    .from(eventOptions)
    .where(eq(eventOptions.eventId, event.id));
  const timeOptions = options.filter((o) => o.startsAt !== null);
  assert.equal(timeOptions.length, 2, "two time options expected");
  ok("time and place dimensions built");

  console.log("\n2. Public view before anyone signs in");
  const publicBoard = await board(event.id, null);
  assert.equal(publicBoard.viewer.role, "public");
  assert.equal(publicBoard.viewer.canRespond, false);
  assert.equal(publicBoard.event.title, `Coffee ${suffix}`);
  ok("anyone can read the event without an account");
  ok("but a signed-out visitor cannot respond");

  console.log("\n3. Participants join and respond");
  const aliceP = await joinEvent(event, alice);
  const bobP = await joinEvent(event, bob);
  assert.notEqual(aliceP.id, bobP.id);
  ok("two participants joined");

  const rejoin = await joinEvent(event, alice);
  assert.equal(rejoin.id, aliceP.id, "join must be idempotent");
  ok("joining twice does not duplicate a participant");

  await setResponses(event, aliceP, [
    { optionId: timeOptions[0].id, value: "yes" },
    { optionId: timeOptions[1].id, value: "no" },
  ]);
  await setResponses(event, bobP, [
    { optionId: timeOptions[0].id, value: "yes" },
    { optionId: timeOptions[1].id, value: "maybe" },
  ]);
  ok("responses recorded");

  // Changing an answer must update, not duplicate.
  await setResponses(event, aliceP, [
    { optionId: timeOptions[1].id, value: "yes" },
  ]);
  const aliceBoard = await board(event.id, alice.id);
  const secondOption = aliceBoard.dimensions
    .find((d) => d.kind === "time")!
    .options.find((o) => o.id === timeOptions[1].id)!;
  assert.equal(secondOption.mine, "yes", "changed answer must overwrite");
  // Alice flipped no -> yes; Bob is still maybe. If the change had inserted a
  // second row instead of updating, Alice would be counted twice here.
  assert.equal(secondOption.yes, 1, "exactly one yes (Alice)");
  assert.equal(secondOption.maybe, 1, "Bob's maybe is untouched");
  assert.equal(secondOption.no, 0, "Alice's old no is gone, not retained");
  assert.equal(
    secondOption.voters?.filter((v) => v.name === "Alice").length,
    1,
    "Alice must appear exactly once",
  );
  ok("changing an answer overwrites instead of duplicating");

  console.log("\n3b. Organizer sees nameless unread updates");
  const beforeSeen = await listEventsWithUpdates(organizer);
  const coffee = beforeSeen.organized.find((row) => row.id === event.id);
  assert.ok(coffee, "organizer list includes the event");
  assert.ok(coffee.unreadCount >= 2, "joins and answers count as unread");
  assert.equal(coffee.latestUpdate, "Someone answered");
  assert.equal(beforeSeen.unreadEventCount, 1);
  assert.doesNotMatch(coffee.latestUpdate ?? "", /Alice|Bob/);
  ok("dashboard listing flags recipient activity without names");

  await markEventSeen(event.id, organizer.id);
  const afterSeen = await listEventsWithUpdates(organizer);
  const caughtUp = afterSeen.organized.find((row) => row.id === event.id);
  assert.equal(caughtUp?.unreadCount, 0);
  assert.equal(caughtUp?.latestUpdate, null);
  assert.equal(afterSeen.unreadEventCount, 0);
  ok("opening the event clears the unread badge");

  console.log("\n4. Board reflects both card taps and totals");
  const organizerBoard = await board(event.id, organizer.id);
  const leadOption = organizerBoard.dimensions
    .find((d) => d.kind === "time")!
    .options.find((o) => o.id === timeOptions[0].id)!;
  assert.equal(leadOption.yes, 2);
  assert.equal(organizerBoard.counts.joined, 3, "organizer counts too");
  assert.equal(organizerBoard.counts.responded, 2);
  assert.ok(organizerBoard.leader, "a leader must be computed");
  assert.equal(organizerBoard.quorum.met, true, "quorum of 2 is met");
  ok(`leader computed, quorum met — "${organizerBoard.summary}"`);

  console.log("\n5. The same board serves participants");
  assert.equal(aliceBoard.event.id, organizerBoard.event.id);
  assert.equal(
    aliceBoard.dimensions.find((d) => d.kind === "time")!.options.length,
    organizerBoard.dimensions.find((d) => d.kind === "time")!.options.length,
  );
  assert.equal(aliceBoard.viewer.role, "participant");
  ok("participants read the identical projection");

  console.log("\n6. Guest-suggested options");
  const timeDimensionId = timeOptions[0].dimensionId;
  await addOption(
    event,
    bob,
    { dimensionId: timeDimensionId, startsAt: new Date(soon + 72 * 3600_000) },
    "participant",
  );
  const withSuggestion = await board(event.id, organizer.id);
  const suggested = withSuggestion.dimensions
    .find((d) => d.kind === "time")!
    .options.filter((o) => o.createdByRole === "participant");
  assert.equal(suggested.length, 1);
  ok("a participant can suggest another time");

  console.log("\n7. Authorization");
  await expectReject("a non-organizer cannot lock the event", () =>
    lockEvent(event, mallory),
  );
  await expectReject("a non-organizer cannot cancel the event", () =>
    cancelEvent(event, mallory),
  );
  await expectReject("a non-organizer cannot rotate the share link", () =>
    rotateShareSlug(event, mallory),
  );
  assert.throws(() => assertOrganizer(event, alice));
  ok("assertOrganizer rejects participants");

  console.log("\n8. Visibility");
  await db
    .update(events)
    .set({ visibility: "blind" })
    .where(eq(events.id, event.id));
  const blindEvent = (
    await db.select().from(events).where(eq(events.id, event.id))
  )[0];
  const blindBoard = await board(blindEvent.id, alice.id);
  assert.equal(blindBoard.participants, null, "roster hidden under blind");
  assert.equal(blindBoard.countsSuppressed, true);
  const blindOption = blindBoard.dimensions
    .find((d) => d.kind === "time")!
    .options.find((o) => o.id === timeOptions[0].id)!;
  assert.equal(blindOption.yes, null, "counts hidden under blind");
  assert.equal(blindOption.mine, "yes", "own answer still visible");
  ok("blind hides others but keeps the viewer's own answer");

  const blindOrganizer = await board(blindEvent.id, organizer.id);
  assert.ok(blindOrganizer.participants, "organizer still sees everything");
  assert.equal(blindOrganizer.dimensions[1].options[0].yes, 2);
  ok("the organizer is unaffected by blind mode");

  await db
    .update(events)
    .set({ visibility: "open" })
    .where(eq(events.id, event.id));

  console.log("\n9. Share link rotation");
  const original = event.shareSlug;
  const rotated = await rotateShareSlug(
    (await db.select().from(events).where(eq(events.id, event.id)))[0],
    organizer,
  );
  assert.notEqual(rotated, original);
  const stillThere = await db
    .select()
    .from(eventParticipants)
    .where(eq(eventParticipants.eventId, event.id));
  assert.equal(stillThere.length, 3, "rotation must not evict participants");
  ok("rotating the link keeps existing participants");

  console.log("\n10. Locking");
  const openEvent = (
    await db.select().from(events).where(eq(events.id, event.id))
  )[0];
  await lockEvent(openEvent, organizer);
  const lockedEvent = (
    await db.select().from(events).where(eq(events.id, event.id))
  )[0];
  assert.equal(lockedEvent.status, "locked");
  assert.ok(lockedEvent.lockedAt);
  await expectReject("a locked event refuses new responses", () =>
    setResponses(lockedEvent, aliceP, [
      { optionId: timeOptions[0].id, value: "no" },
    ]),
  );
  await expectReject("a locked event refuses new joiners", () =>
    joinEvent(lockedEvent, mallory),
  );
  const lockedBoard = await board(event.id, alice.id);
  assert.equal(lockedBoard.viewer.canRespond, false);
  ok("locked board reports responding is closed");

  console.log("\n11. Deadline enforcement");
  const past = await createEvent(organizer, {
    title: `Past ${suffix}`,
    timezone: "UTC",
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    slots: [{ startsAt: new Date(soon).toISOString() }],
  });
  const pastP = await joinEvent(past, alice);
  await db
    .update(events)
    .set({ deadlineAt: new Date(Date.now() - 60_000) })
    .where(eq(events.id, past.id));
  const expired = (
    await db.select().from(events).where(eq(events.id, past.id))
  )[0];
  const pastOption = (
    await db.select().from(eventOptions).where(eq(eventOptions.eventId, past.id))
  )[0];
  await expectReject("a passed deadline refuses responses", () =>
    setResponses(expired, pastP, [{ optionId: pastOption.id, value: "yes" }]),
  );

  console.log("\n12. Input validation");
  await expectReject("a past deadline is rejected at creation", () =>
    createEvent(organizer, {
      title: "Nope",
      deadlineAt: new Date(Date.now() - 3600_000).toISOString(),
      slots: [{ startsAt: new Date(soon).toISOString() }],
    }),
  );
  await expectReject("an event with no time at all is rejected", () =>
    createEvent(organizer, {
      title: "Nope",
      deadlineAt: new Date(soon).toISOString(),
      slots: [],
    }),
  );
  await expectReject("an empty title is rejected", () =>
    createEvent(organizer, {
      title: "   ",
      deadlineAt: new Date(soon).toISOString(),
      fixedStartsAt: new Date(soon).toISOString(),
    }),
  );
  const stillOpenEvent = await createEvent(organizer, {
    title: `Foreign ${suffix}`,
    timezone: "UTC",
    deadlineAt: new Date(soon).toISOString(),
    slots: [{ startsAt: new Date(soon).toISOString() }],
  });
  const foreignP = await joinEvent(stillOpenEvent, alice);
  await expectReject("responding to another event's option is rejected", () =>
    setResponses(stillOpenEvent, foreignP, [
      { optionId: timeOptions[0].id, value: "yes" },
    ]),
  );

  console.log("\n13. RSVP-only event");
  const rsvp = await createEvent(organizer, {
    title: `Housewarming ${suffix}`,
    timezone: "UTC",
    deadlineAt: new Date(soon).toISOString(),
    fixedStartsAt: new Date(soon + 24 * 3600_000).toISOString(),
    place: "My place",
  });
  const rsvpP = await joinEvent(rsvp, alice);
  await setResponses(rsvp, rsvpP, [], "yes");
  const rsvpBoard = await board(rsvp.id, organizer.id);
  const timeDim = rsvpBoard.dimensions.find((d) => d.kind === "time");
  assert.equal(timeDim?.mode, "fixed", "RSVP events fix the time");
  const aliceRow = rsvpBoard.participants!.find((p) => p.userId === alice.id)!;
  assert.equal(aliceRow.attendance, "yes");
  ok("RSVP flow records attendance against a fixed time");

  console.log("\n14. Archive is per person");
  const shared = await createEvent(organizer, {
    title: `Shared plan ${suffix}`,
    timezone: "UTC",
    deadlineAt: new Date(soon).toISOString(),
    fixedStartsAt: new Date(soon + 24 * 3600_000).toISOString(),
    place: "Anywhere",
  });
  await joinEvent(shared, alice);

  const seenByBoth = async () => ({
    organizer: (await listEventsForUser(organizer)).organized.some(
      (e) => e.id === shared.id,
    ),
    alice: (await listEventsForUser(alice)).joined.some(
      (e) => e.id === shared.id,
    ),
  });

  assert.deepEqual(await seenByBoth(), { organizer: true, alice: true });
  await archiveEvent(shared, organizer, true);
  assert.deepEqual(
    await seenByBoth(),
    { organizer: false, alice: true },
    "archiving must not touch anyone else's list",
  );
  ok("the organizer archiving leaves the participant's copy alone");

  const archivedList = await listEventsForUser(organizer, { archived: true });
  assert.ok(
    archivedList.organized.some((e) => e.id === shared.id),
    "archived events are still reachable",
  );
  await archiveEvent(shared, organizer, false);
  assert.deepEqual(await seenByBoth(), { organizer: true, alice: true });
  ok("un-archiving puts it back");

  console.log("\n15. Delete is organizer-only, cancelled-only");
  await expectReject("a participant cannot delete", () =>
    deleteEvent(shared, alice),
  );
  await expectReject("an open event cannot be deleted", () =>
    deleteEvent(shared, organizer),
  );

  await cancelEvent(shared, organizer);
  const cancelled = (await db.select().from(events).where(eq(events.id, shared.id)))[0];
  // Cancelling queues the "it is off" mail, and notification_outbox cascades
  // from events — so a delete before it drains would erase the telling.
  await expectReject("delete waits for the cancellation to be sent", () =>
    deleteEvent(cancelled, organizer),
  );
  await db
    .update(notificationOutbox)
    .set({ sentAt: new Date() })
    .where(eq(notificationOutbox.eventId, shared.id));

  await deleteEvent(cancelled, organizer);
  const goneRows = await db.select().from(events).where(eq(events.id, shared.id));
  assert.equal(goneRows.length, 0, "the event row is gone");
  const orphanParticipants = await db
    .select()
    .from(eventParticipants)
    .where(eq(eventParticipants.eventId, shared.id));
  assert.equal(orphanParticipants.length, 0, "participants cascade away");
  assert.equal(
    (await listEventsForUser(alice)).joined.some((e) => e.id === shared.id),
    false,
    "it leaves the participant's list too",
  );
  ok("a cancelled event deletes for everyone once the mail has gone");

  console.log("\n16. Paging");
  const paged = await listEventsForUser(organizer, { limit: 1, offset: 0 });
  const pagedCount = paged.organized.length + paged.joined.length;
  assert.equal(pagedCount, 1, "a page holds what it was asked for");
  const second = await listEventsForUser(organizer, { limit: 1, offset: 1 });
  const firstId = [...paged.organized, ...paged.joined][0]?.id;
  const secondId = [...second.organized, ...second.joined][0]?.id;
  assert.notEqual(firstId, secondId, "the second page is different events");
  assert.equal(paged.hasMore, true, "hasMore sees past the page");
  ok("the list pages instead of silently truncating");

  console.log("\n17. Cleanup");
  await db.delete(events).where(eq(events.id, event.id));
  await db.delete(events).where(eq(events.id, past.id));
  await db.delete(events).where(eq(events.id, rsvp.id));
  await db.delete(events).where(eq(events.id, stillOpenEvent.id));
  for (const u of [organizer, alice, bob, mallory]) {
    await db.delete(users).where(eq(users.id, u.id));
  }
  ok("test rows removed");

  console.log("\nHoneyMatcha events e2e passed.\n");
  process.exit(0);
}

main().catch((error) => {
  console.error("\nHoneyMatcha events e2e FAILED:", error);
  process.exit(1);
});
