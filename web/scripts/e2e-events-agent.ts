import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  confirms,
  eventOptions,
  eventParticipants,
  events,
  notificationOutbox,
  users,
} from "../src/db/schema";
import { createEvent, joinEvent, setResponses } from "../src/lib/events/service";
import { closeEvent, runEventsTick } from "../src/lib/events/tick";
import {
  drainNotificationOutbox,
  enqueueEventNotification,
} from "../src/lib/events/notify";
import { decideConfirm } from "../src/lib/confirms";
import { bookConfirmedEvent } from "../src/lib/events/book";

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

async function main() {
  const db = getDb();
  const suffix = randomBytes(4).toString("hex");

  const [organizer] = await db
    .insert(users)
    .values({
      clerkUserId: `clerk_aorg_${suffix}`,
      email: `aorg_${suffix}@example.com`,
      name: "Organizer",
    })
    .returning();
  const [alice] = await db
    .insert(users)
    .values({
      clerkUserId: `clerk_aal_${suffix}`,
      email: `aal_${suffix}@example.com`,
      name: "Alice",
    })
    .returning();
  const [bob] = await db
    .insert(users)
    .values({
      clerkUserId: `clerk_abo_${suffix}`,
      email: `abo_${suffix}@example.com`,
      name: "Bob",
    })
    .returning();

  const soon = Date.now() + 72 * 3600_000;

  console.log("\n1. Deadline closes an event and picks the winner");
  const event = await createEvent(organizer, {
    title: `Resolve ${suffix}`,
    timezone: "UTC",
    quorumMin: 2,
    deadlineAt: new Date(Date.now() + 3600_000).toISOString(),
    slots: [
      { startsAt: new Date(soon).toISOString() },
      { startsAt: new Date(soon + 3600_000).toISOString() },
    ],
  });
  const options = (
    await db.select().from(eventOptions).where(eq(eventOptions.eventId, event.id))
  ).filter((o) => o.startsAt);

  const aliceP = await joinEvent(event, alice);
  const bobP = await joinEvent(event, bob);
  await setResponses(event, aliceP, [{ optionId: options[1].id, value: "yes" }]);
  await setResponses(event, bobP, [{ optionId: options[1].id, value: "yes" }]);

  await db
    .update(events)
    .set({ deadlineAt: new Date(Date.now() - 60_000) })
    .where(eq(events.id, event.id));

  const tick = await runEventsTick();
  assert.ok(tick.locked >= 1, "the tick should have locked one event");
  const locked = (
    await db.select().from(events).where(eq(events.id, event.id))
  )[0];
  assert.equal(locked.status, "locked");
  const outcome = locked.outcome as Record<string, unknown>;
  assert.equal(outcome.winningOptionId, options[1].id, "second slot should win");
  assert.equal(outcome.yes, 2);
  ok(`locked with winner "${outcome.winningLabel}"`);

  console.log("\n2. Locking creates an approval, and does NOT book");
  const pending = await db
    .select()
    .from(confirms)
    .where(
      and(eq(confirms.userId, organizer.id), eq(confirms.action, "event.confirm")),
    );
  assert.equal(pending.length, 1, "exactly one confirm expected");
  assert.equal(pending[0].status, "pending");
  assert.equal(locked.confirmedAt, null, "must not be confirmed before approval");
  ok("an approval is waiting and nothing was booked");

  console.log("\n3. The tick is idempotent");
  const before = await db.select().from(confirms);
  await runEventsTick();
  await closeEvent(locked);
  const after = await db.select().from(confirms);
  assert.equal(after.length, before.length, "no duplicate confirms");
  ok("running the tick again changes nothing");

  console.log("\n4. Approval books it");
  const decided = await decideConfirm({
    user: organizer,
    confirmId: pending[0].id,
    decision: "approved",
  });
  assert.equal(decided.status, "approved");
  const confirmed = (
    await db.select().from(events).where(eq(events.id, event.id))
  )[0];
  assert.equal(confirmed.status, "confirmed");
  assert.ok(confirmed.confirmedAt, "confirmedAt should be set");
  ok("approving the confirm booked and confirmed the event");

  console.log("\n5. Booking twice is refused");
  const second = await bookConfirmedEvent(confirmed);
  assert.equal(second.status, "already_confirmed");
  ok("a confirmed event will not be booked again");

  console.log("\n6. Quorum missed expires instead of locking");
  const lonely = await createEvent(organizer, {
    title: `Lonely ${suffix}`,
    timezone: "UTC",
    quorumMin: 5,
    deadlineAt: new Date(Date.now() + 3600_000).toISOString(),
    slots: [{ startsAt: new Date(soon).toISOString() }],
  });
  const lonelyOption = (
    await db.select().from(eventOptions).where(eq(eventOptions.eventId, lonely.id))
  )[0];
  const lonelyP = await joinEvent(lonely, alice);
  await setResponses(lonely, lonelyP, [
    { optionId: lonelyOption.id, value: "yes" },
  ]);
  await db
    .update(events)
    .set({ deadlineAt: new Date(Date.now() - 60_000) })
    .where(eq(events.id, lonely.id));
  await runEventsTick();
  const expired = (
    await db.select().from(events).where(eq(events.id, lonely.id))
  )[0];
  assert.equal(expired.status, "expired");
  const noConfirm = await db
    .select()
    .from(confirms)
    .where(eq(confirms.sessionId, expired.sessionId ?? "00000000-0000-0000-0000-000000000000"));
  assert.equal(noConfirm.length, 0, "an unmet quorum must not create a confirm");
  ok("quorum shortfall expires the event and creates no approval");

  console.log("\n6b. An RSVP event locks on attendance, not on choosing a slot");
  const rsvp = await createEvent(organizer, {
    title: `RSVP ${suffix}`,
    timezone: "UTC",
    deadlineAt: new Date(Date.now() + 3600_000).toISOString(),
    fixedStartsAt: new Date(soon).toISOString(),
  });
  const rsvpA = await joinEvent(rsvp, alice);
  const rsvpB = await joinEvent(rsvp, bob);
  await setResponses(rsvp, rsvpA, [], "yes");
  await setResponses(rsvp, rsvpB, [], "yes");
  await db
    .update(events)
    .set({ deadlineAt: new Date(Date.now() - 60_000) })
    .where(eq(events.id, rsvp.id));
  await runEventsTick();
  const rsvpAfter = (
    await db.select().from(events).where(eq(events.id, rsvp.id))
  )[0];
  assert.equal(
    rsvpAfter.status,
    "locked",
    "an RSVP event with attendees must lock, not expire",
  );
  const rsvpConfirm = await db
    .select()
    .from(confirms)
    .where(eq(confirms.sessionId, rsvpAfter.sessionId!));
  assert.equal(rsvpConfirm.length, 1, "the organizer must get an approval");
  assert.equal((rsvpAfter.outcome as Record<string, unknown>).yes, 2);
  ok("a fixed-time RSVP event locks and asks the organizer to confirm");

  console.log("\n6c. An RSVP event nobody joined expires");
  const empty = await createEvent(organizer, {
    title: `Empty ${suffix}`,
    timezone: "UTC",
    deadlineAt: new Date(Date.now() + 3600_000).toISOString(),
    fixedStartsAt: new Date(soon).toISOString(),
  });
  await db
    .update(events)
    .set({ deadlineAt: new Date(Date.now() - 60_000) })
    .where(eq(events.id, empty.id));
  await runEventsTick();
  const emptyAfter = (
    await db.select().from(events).where(eq(events.id, empty.id))
  )[0];
  assert.equal(emptyAfter.status, "expired");
  ok("an RSVP event with nobody coming expires instead of booking");

  console.log("\n7. Notification outbox is idempotent");
  const first = await enqueueEventNotification({
    eventId: event.id,
    template: "event_locked",
    dedupeKey: `test_dupe:${event.id}`,
    payload: { title: event.title },
    toOrganizerOnly: true,
  });
  const repeat = await enqueueEventNotification({
    eventId: event.id,
    template: "event_locked",
    dedupeKey: `test_dupe:${event.id}`,
    payload: { title: event.title },
    toOrganizerOnly: true,
  });
  assert.equal(first, true, "first enqueue should queue");
  assert.equal(repeat, false, "second enqueue must dedupe");
  ok("a repeated enqueue is deduped, so a cron retry cannot double-send");

  console.log("\n8. Draining without an email provider leaves rows queued");
  const savedKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const drain = await drainNotificationOutbox();
  assert.equal(drain.sent, 0);
  assert.ok(drain.skipped > 0, "rows should be skipped, not lost");
  const stillQueued = await db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.eventId, event.id));
  assert.ok(
    stillQueued.every((row) => row.sentAt === null),
    "nothing should be marked sent",
  );
  if (savedKey) process.env.RESEND_API_KEY = savedKey;
  ok("no email provider means queued, never lost and never fake-sent");

  console.log("\n9. Participants were notified of the lock");
  const lockNotices = await db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventId, event.id),
        eq(notificationOutbox.template, "event_locked"),
      ),
    );
  const recipients = new Set(lockNotices.map((n) => n.userId));
  assert.ok(recipients.size >= 3, "organizer + both participants");
  ok(`${recipients.size} people queued for the lock notice`);

  console.log("\n10. SMS preference queues a second outbox row");
  const savedFrom = process.env.TWILIO_FROM_NUMBER;
  process.env.TWILIO_FROM_NUMBER = "+15550001111";
  await db
    .update(users)
    .set({
      notifyChannel: "both",
      phoneE164: `+1555${String(parseInt(suffix, 16) % 10_000_000).padStart(7, "0")}`,
    })
    .where(eq(users.id, alice.id));
  const smsFirst = await enqueueEventNotification({
    eventId: event.id,
    template: "event_update",
    dedupeKey: `test_sms:${event.id}`,
    payload: { title: event.title, summary: "someone answered" },
    userId: alice.id,
    notifyAgents: false,
  });
  const smsRepeat = await enqueueEventNotification({
    eventId: event.id,
    template: "event_update",
    dedupeKey: `test_sms:${event.id}`,
    payload: { title: event.title, summary: "someone answered" },
    userId: alice.id,
    notifyAgents: false,
  });
  assert.equal(smsFirst, true);
  assert.equal(smsRepeat, false);
  const aliceRows = await db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventId, event.id),
        eq(notificationOutbox.userId, alice.id),
        eq(notificationOutbox.template, "event_update"),
      ),
    );
  const channels = new Set(aliceRows.map((row) => row.channel));
  assert.ok(channels.has("email"), "email row for both");
  assert.ok(channels.has("sms"), "sms row for both");
  ok("email + text are queued separately and still deduped");

  const savedSmsSid = process.env.TWILIO_ACCOUNT_SID;
  const savedSmsToken = process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.RESEND_API_KEY;
  const mixedDrain = await drainNotificationOutbox();
  assert.equal(mixedDrain.sent, 0);
  assert.ok(mixedDrain.skipped > 0);
  if (savedKey) process.env.RESEND_API_KEY = savedKey;
  if (savedSmsSid) process.env.TWILIO_ACCOUNT_SID = savedSmsSid;
  if (savedSmsToken) process.env.TWILIO_AUTH_TOKEN = savedSmsToken;
  if (savedFrom !== undefined) process.env.TWILIO_FROM_NUMBER = savedFrom;
  else delete process.env.TWILIO_FROM_NUMBER;
  ok("missing Twilio leaves text rows queued, same as missing Resend");

  console.log("\n11. A closed event refuses further responses");
  await expectReject("a confirmed event refuses new responses", () =>
    setResponses(confirmed, aliceP, [
      { optionId: options[0].id, value: "yes" },
    ]),
  );

  console.log("\n12. Cleanup");
  await db.delete(events).where(eq(events.id, event.id));
  await db.delete(events).where(eq(events.id, lonely.id));
  await db.delete(events).where(eq(events.id, rsvp.id));
  await db.delete(events).where(eq(events.id, empty.id));
  for (const u of [organizer, alice, bob]) {
    await db.delete(users).where(eq(users.id, u.id));
  }
  const leftover = await db
    .select()
    .from(eventParticipants)
    .where(eq(eventParticipants.eventId, event.id));
  assert.equal(leftover.length, 0, "cascade should have removed participants");
  ok("test rows removed and cascades verified");

  console.log("\nHoneyMatcha events agent/tick e2e passed.\n");
  process.exit(0);
}

main().catch((error) => {
  console.error("\nHoneyMatcha events agent e2e FAILED:", error);
  process.exit(1);
});
