import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  agentInbox,
  agentProfiles,
  apiKeys,
  eventParticipants,
  events,
  links,
  notificationOutbox,
  users,
  type User,
} from "../src/db/schema";
import type { AgentAuth } from "../src/lib/agent-auth";
import { dispatchMcpTool } from "../src/lib/mcp-tools";
import { DEFAULT_AGENT_SCOPES } from "../src/lib/scopes";
import { claimAgentProfile } from "../src/lib/agent-profiles";
import { listInboxForUser } from "../src/lib/agent-inbox";

const ORIGIN = "https://honeymatcha.test";

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}

async function expectReject(
  label: string,
  fn: () => Promise<unknown>,
  match?: RegExp,
) {
  let message: string | null = null;
  try {
    await fn();
  } catch (error) {
    message = String((error as Error)?.message ?? error);
  }
  assert.notEqual(message, null, `expected rejection: ${label}`);
  if (match) assert.match(message!, match, label);
  ok(label);
}

/** A request the dispatcher can read a base URL off, as the route layer does. */
function asRequest(): Request {
  return new Request(`${ORIGIN}/api/mcp`, { method: "POST" });
}

async function main() {
  process.env.ENABLE_EVENTS = "true";
  const db = getDb();
  const suffix = randomBytes(4).toString("hex");

  async function makeUser(tag: string, name: string): Promise<AgentAuth> {
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: `clerk_${tag}_${suffix}`,
        email: `${tag}_${suffix}@example.com`,
        name,
      })
      .returning();
    const [apiKey] = await db
      .insert(apiKeys)
      .values({
        userId: user.id,
        name: `${name} agent`,
        keyPrefix: `hm_${tag}${suffix}`,
        keyHash: randomBytes(16).toString("hex"),
        // Exactly what a real pairing hands out — no hand-widened scopes.
        scopes: DEFAULT_AGENT_SCOPES,
      })
      .returning();
    return { user, apiKey };
  }

  const host = await makeUser("mhost", "Dana Host");
  const guest = await makeUser("mguest", "Sam Guest");
  const stranger = await makeUser("mstrg", "Kim Stranger");
  const created: string[] = [];

  const call = (auth: AgentAuth, tool: string, args: Record<string, unknown> = {}) =>
    dispatchMcpTool(auth, tool, args, asRequest());

  /* ---------------------------------------------------------------- */
  console.log("\n1. A paired agent can create an event with default scopes");
  const createdEvent = (await call(host, "create_event", {
    title: `Agent planning ${suffix}`,
    timezone: "UTC",
    quorumMin: 2,
    slots: [
      { startsAt: new Date(Date.now() + 86_400_000).toISOString() },
      { startsAt: new Date(Date.now() + 172_800_000).toISOString() },
    ],
  })) as {
    event: { id: string; shareSlug: string };
    shareUrl: string;
  };
  created.push(createdEvent.event.id);
  assert.ok(createdEvent.event.id, "create_event should return an event");
  assert.equal(
    createdEvent.shareUrl,
    `${ORIGIN}/e/${createdEvent.event.shareSlug}`,
  );
  ok("create_event works on the scopes a pairing actually grants");

  /* ---------------------------------------------------------------- */
  console.log("\n2. A share link is enough for another agent to act");
  const slug = createdEvent.event.shareSlug;
  for (const [label, ref] of [
    ["an event id", createdEvent.event.id],
    ["a bare share slug", slug],
    ["a pasted share URL", `${ORIGIN}/e/${slug}`],
    ["a URL from another host", `https://honeymatcha.io/e/${slug}?utm=x`],
  ] as const) {
    const board = (await call(guest, "get_event_board", { eventId: ref })) as {
      eventId: string;
    };
    assert.equal(board.eventId, createdEvent.event.id, label);
    ok(`get_event_board resolves ${label}`);
  }

  await expectReject(
    "an unknown link is refused",
    () => call(guest, "get_event_board", { eventId: "not-a-real-slug" }),
    /not valid/i,
  );

  /* ---------------------------------------------------------------- */
  console.log("\n3. An agent answers on its human's behalf");
  const board = (await call(guest, "get_event_board", {
    eventId: `${ORIGIN}/e/${slug}`,
  })) as {
    board: {
      dimensions: Array<{
        id: string;
        kind: string;
        options: Array<{ id: string }>;
      }>;
    };
  };
  const timeDim = board.board.dimensions.find((d) => d.kind === "time")!;
  const [first, second] = timeDim.options;

  const responded = (await call(guest, "respond_to_event", {
    eventId: slug,
    entries: [
      { optionId: first.id, value: "yes" },
      { optionId: second.id, value: "no" },
    ],
  })) as {
    board: {
      viewer: { hasResponded: boolean; attendance: string };
      dimensions: Array<{ kind: string; options: Array<{ mine: string | null }> }>;
    };
  };
  assert.equal(responded.board.viewer.hasResponded, true);
  assert.equal(responded.board.viewer.attendance, "yes");
  ok("respond_to_event joins and records in one call");

  const persisted = (await call(guest, "get_event_board", { eventId: slug })) as {
    board: { dimensions: Array<{ kind: string; options: Array<{ mine: string | null }> }> };
  };
  const mine = persisted.board.dimensions
    .find((d) => d.kind === "time")!
    .options.map((option) => option.mine);
  assert.deepEqual(mine, ["yes", "no"]);
  ok("the answers are still there on the next read");

  /* ---------------------------------------------------------------- */
  console.log("\n4. Bad answers are refused, not half-applied");
  await expectReject(
    "an unknown option id is refused",
    () =>
      call(guest, "respond_to_event", {
        eventId: slug,
        entries: [{ optionId: createdEvent.event.id, value: "yes" }],
      }),
    /not on this event/i,
  );
  await expectReject(
    "a nonsense value is refused",
    () =>
      call(guest, "respond_to_event", {
        eventId: slug,
        entries: [{ optionId: first.id, value: "probably" }],
      }),
    /yes, no, or maybe/i,
  );
  await expectReject(
    "an empty response is refused",
    () => call(guest, "respond_to_event", { eventId: slug }),
    /entries|attendance/i,
  );

  /* ---------------------------------------------------------------- */
  console.log("\n5. Organizer-only actions stay organizer-only");
  await expectReject(
    "a participant's agent cannot add an organizer option",
    () =>
      call(guest, "add_event_option", {
        eventId: slug,
        dimensionId: timeDim.id,
        startsAt: new Date(Date.now() + 259_200_000).toISOString(),
      }),
    /only the organizer/i,
  );
  await expectReject(
    "a participant's agent cannot nudge",
    () => call(guest, "nudge_event_participants", { eventId: slug }),
    /only the organizer/i,
  );
  await expectReject(
    "a stranger's agent cannot suggest without joining",
    () =>
      call(stranger, "suggest_event_option", {
        eventId: slug,
        dimensionId: timeDim.id,
        label: "My place",
      }),
    /join this event/i,
  );

  const suggested = (await call(guest, "suggest_event_option", {
    eventId: slug,
    dimensionId: timeDim.id,
    startsAt: new Date(Date.now() + 259_200_000).toISOString(),
  })) as { role: string };
  assert.equal(suggested.role, "participant");
  ok("a participant's agent can suggest a time, marked as theirs");

  /* ---------------------------------------------------------------- */
  console.log("\n6. Irreversible actions are still refused");
  for (const action of ["lock_event", "cancel_event", "confirm_event"]) {
    const refusal = (await call(host, action, { eventId: slug })) as {
      ok: boolean;
      error: string;
    };
    assert.equal(refusal.ok, false, `${action} must not succeed`);
    assert.match(refusal.error, /human-only/i);
  }
  ok("lock, cancel and confirm answer with an explanation, not an action");

  /* ---------------------------------------------------------------- */
  console.log("\n7. Events reach the agent inbox, not just the mailbox");
  const hostInbox = await listInboxForUser(host.user.id);
  const joinItem = hostInbox.find(
    (item) => item.kind === "event.participant_joined",
  );
  assert.ok(joinItem, "the organizer's agent should hear that someone joined");
  assert.equal(joinItem!.eventId, createdEvent.event.id);
  assert.match(joinItem!.summary, /get_event_board/);
  ok("the organizer's agent is told when someone joins");

  // That one is agent-only: a mail per person opening a link would be noise.
  const joinMail = await db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventId, createdEvent.event.id),
        eq(notificationOutbox.template, "participant_joined"),
      ),
    );
  assert.equal(joinMail.length, 0, "joins must not send email");
  ok("...and nobody is emailed about it");

  /* ---------------------------------------------------------------- */
  console.log("\n8. Both channels dedupe off the same key");
  const beforeCount = (await listInboxForUser(host.user.id)).length;
  const { enqueueEventNotification } = await import("../src/lib/events/notify");
  const shared = { title: "Dedupe check" };
  const firstSend = await enqueueEventNotification({
    eventId: createdEvent.event.id,
    template: "event_locked",
    dedupeKey: `meet_test_dupe:${createdEvent.event.id}`,
    payload: shared,
    toOrganizerOnly: true,
  });
  const secondSend = await enqueueEventNotification({
    eventId: createdEvent.event.id,
    template: "event_locked",
    dedupeKey: `meet_test_dupe:${createdEvent.event.id}`,
    payload: shared,
    toOrganizerOnly: true,
  });
  assert.equal(firstSend, true);
  assert.equal(secondSend, false);
  assert.equal(
    (await listInboxForUser(host.user.id)).length,
    beforeCount + 1,
    "a retried notification must not double up in the inbox",
  );
  ok("a cron retry delivers neither a second email nor a second inbox item");

  /* ---------------------------------------------------------------- */
  console.log("\n9. A scan turns into a real plan");
  await claimAgentProfile({
    user: host.user,
    handle: `dana${suffix}`,
    displayName: "Dana Host",
    origin: ORIGIN,
  });

  const met = (await call(guest, "record_meeting", {
    handle: `dana${suffix}`,
    intent: "coffee",
    timezone: "America/New_York",
  })) as {
    connection: { status: string };
    event: { id: string; url: string; slots: number; reused: boolean } | null;
  };
  assert.equal(met.connection.status, "requested");
  assert.ok(met.event, "coffee should produce an event");
  created.push(met.event!.id);
  assert.equal(met.event!.slots, 4, "the plan arrives with times already on it");
  assert.equal(met.event!.reused, false);
  ok("a meeting creates an approval-gated request and a seeded event");

  // The connection is a request, never an accomplished fact.
  const [pending] = await db
    .select()
    .from(links)
    .where(
      and(eq(links.fromUserId, host.user.id), eq(links.toUserId, guest.user.id)),
    );
  assert.equal(pending.status, "pending", "a scan must not link two people");
  ok("scanning a code never connects two agents on its own");

  // The other person is on the event, and their agent was told.
  const onEvent = await db
    .select()
    .from(eventParticipants)
    .where(
      and(
        eq(eventParticipants.eventId, met.event!.id),
        eq(eventParticipants.userId, host.user.id),
      ),
    );
  assert.equal(onEvent.length, 1);
  assert.equal(onEvent[0].source, "meet:coffee");
  const invite = (await listInboxForUser(host.user.id)).find(
    (item) => item.kind === "event.event_invited",
  );
  assert.ok(invite, "the scanned person's agent should get the invitation");
  assert.equal(invite!.eventId, met.event!.id);
  ok("the other person is on the event and their agent knows");

  /* ---------------------------------------------------------------- */
  console.log("\n10. A second tap does not make a second plan");
  const again = (await call(guest, "record_meeting", {
    handle: `dana${suffix}`,
    intent: "coffee",
  })) as { event: { id: string; reused: boolean } | null };
  assert.equal(again.event!.id, met.event!.id);
  assert.equal(again.event!.reused, true);
  ok("tapping coffee twice lands on the same event");

  const differentShape = (await call(guest, "record_meeting", {
    handle: `dana${suffix}`,
    intent: "drinks",
  })) as { event: { id: string } | null };
  assert.notEqual(differentShape.event!.id, met.event!.id);
  created.push(differentShape.event!.id);
  ok("a different shape is a different plan");

  await expectReject(
    "you cannot meet yourself",
    () => call(host, "record_meeting", { handle: `dana${suffix}`, intent: "coffee" }),
    /your own/i,
  );
  await expectReject(
    "an unknown shape is refused",
    () =>
      call(guest, "record_meeting", {
        handle: `dana${suffix}`,
        intent: "constructor",
      }),
    /coffee, lunch, drinks, call, or connect/i,
  );

  /* ---------------------------------------------------------------- */
  console.log("\n11. Following an event actually tells you things");

  // Guest's agent subscribes using nothing but the share link.
  const subscribed = (await call(guest, "set_event_notifications", {
    eventId: `${ORIGIN}/e/${slug}`,
  })) as { ok: boolean; notify: boolean };
  assert.equal(subscribed.notify, true);
  ok("an agent can follow an event straight from its link");

  // A third person answers; the subscriber hears about it, the actor doesn't.
  const strangerBoard = (await call(stranger, "get_event_board", {
    eventId: slug,
  })) as {
    board: { dimensions: Array<{ kind: string; options: Array<{ id: string }> }> };
  };
  const strangerOption = strangerBoard.board.dimensions.find(
    (d) => d.kind === "time",
  )!.options[0];
  await call(stranger, "respond_to_event", {
    eventId: slug,
    entries: [{ optionId: strangerOption.id, value: "yes" }],
  });

  const updateMail = await db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventId, createdEvent.event.id),
        eq(notificationOutbox.template, "event_update"),
      ),
    );
  const mailedTo = new Set(updateMail.map((row) => row.userId));
  assert.ok(mailedTo.has(guest.user.id), "the subscriber should be emailed");
  assert.ok(!mailedTo.has(stranger.user.id), "the actor must not be notified");
  assert.ok(
    !mailedTo.has(host.user.id),
    "the unsubscribed organizer must not be emailed",
  );
  ok("a response notifies exactly the people who opted in");

  const guestUpdates = (await listInboxForUser(guest.user.id)).filter(
    (item) => item.kind === "event.event_update",
  );
  assert.ok(guestUpdates.length > 0, "the subscriber's agent should hear too");
  assert.equal(guestUpdates[0]!.eventId, createdEvent.event.id);
  ok("...and the same update reaches their agent's inbox");

  // A new suggestion notifies subscribers as well.
  const mailsBefore = updateMail.length;
  await call(stranger, "suggest_event_option", {
    eventId: slug,
    dimensionId: timeDim.id,
    startsAt: new Date(Date.now() + 345_600_000).toISOString(),
  });
  const afterOption = await db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventId, createdEvent.event.id),
        eq(notificationOutbox.template, "event_update"),
      ),
    );
  assert.ok(
    afterOption.length > mailsBefore,
    "a suggested option should notify subscribers",
  );
  ok("a new suggestion notifies followers");

  // Unsubscribing stops the flow.
  const unsubscribed = (await call(guest, "set_event_notifications", {
    eventId: slug,
    notify: false,
  })) as { notify: boolean };
  assert.equal(unsubscribed.notify, false);
  const countBefore = (
    await db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.eventId, createdEvent.event.id),
          eq(notificationOutbox.template, "event_update"),
        ),
      )
  ).length;
  await call(stranger, "respond_to_event", {
    eventId: slug,
    entries: [{ optionId: strangerOption.id, value: "maybe" }],
  });
  const countAfter = (
    await db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.eventId, createdEvent.event.id),
          eq(notificationOutbox.template, "event_update"),
        ),
      )
  ).length;
  assert.equal(countAfter, countBefore, "unsubscribing must stop updates");
  ok("turning it off actually turns it off");

  /* ---------------------------------------------------------------- */
  console.log("\n12. Private events do not narrate responses to followers");
  const blindEvent = (await call(host, "create_event", {
    title: `Blind hiring ${suffix}`,
    timezone: "UTC",
    visibility: "blind",
    slots: [{ startsAt: new Date(Date.now() + 86_400_000).toISOString() }],
  })) as { event: { id: string; shareSlug: string } };
  created.push(blindEvent.event.id);

  await call(guest, "set_event_notifications", {
    eventId: blindEvent.event.shareSlug,
  });
  await call(stranger, "respond_to_event", {
    eventId: blindEvent.event.shareSlug,
    attendance: "yes",
  });
  const blindMail = await db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventId, blindEvent.event.id),
        eq(notificationOutbox.template, "event_update"),
      ),
    );
  assert.equal(
    blindMail.filter((row) => row.userId === guest.user.id).length,
    0,
    "a blind event must not tell followers who answered",
  );
  ok("blind events keep responses out of follower updates");

  /* ---------------------------------------------------------------- */
  console.log("\n13. Human-first pages are agentic too");
  const people = (await call(host, "list_people")) as {
    met: Array<{ userId: string; viaEventId: string }>;
  };
  assert.ok(
    people.met.some((person) => person.userId === stranger.user.id),
    "list_people should surface someone you only met on an event",
  );
  ok("list_people returns people met through events");

  const liveBefore = (await call(host, "list_events")) as {
    organized: Array<{ id: string; shareUrl?: string; timezone?: string }>;
    archived: boolean;
  };
  assert.equal(liveBefore.archived, false);
  assert.ok(
    liveBefore.organized.some((event) => event.id === createdEvent.event.id),
  );
  assert.ok(
    liveBefore.organized.every((event) => event.shareUrl?.includes("/e/")),
    "list_events must return pasteable share URLs",
  );
  ok("list_events includes share URLs and the live event");

  const archived = (await call(host, "archive_event", {
    eventId: slug,
  })) as { archived: boolean };
  assert.equal(archived.archived, true);
  const liveAfter = (await call(host, "list_events")) as {
    organized: Array<{ id: string }>;
  };
  assert.equal(
    liveAfter.organized.some((event) => event.id === createdEvent.event.id),
    false,
  );
  const hidden = (await call(host, "list_events", { archived: true })) as {
    organized: Array<{ id: string }>;
    archived: boolean;
  };
  assert.equal(hidden.archived, true);
  assert.ok(
    hidden.organized.some((event) => event.id === createdEvent.event.id),
  );
  await call(host, "archive_event", { eventId: slug, archived: false });
  ok("archive_event hides and restores an event on this human's list");

  const approved = (await call(host, "approve_connection", {
    linkId: pending.id,
  })) as { ok: boolean; link: { status: string } };
  assert.equal(approved.ok, true);
  assert.equal(approved.link.status, "active");
  ok("approve_connection activates a pending public-page request");

  const policy = (await call(host, "update_link_policy", {
    linkId: pending.id,
    confirmRequired: true,
    timezone: "America/New_York",
  })) as { ok: boolean; link: { timezone: string | null } };
  assert.equal(policy.ok, true);
  assert.equal(policy.link.timezone, "America/New_York");
  ok("update_link_policy writes the same policy the People page edits");

  const revoked = (await call(host, "revoke_link", {
    linkId: pending.id,
  })) as { ok: boolean };
  assert.equal(revoked.ok, true);
  ok("revoke_link closes a connection the agent just approved");

  await expectReject(
    "default pairings cannot decide a confirm gate",
    () =>
      call(host, "respond_confirm", {
        action: "approve",
        confirmId: createdEvent.event.id,
      }),
    /approvals:write|insufficient_scope/i,
  );

  /* ---------------------------------------------------------------- */
  console.log("\n14. Cleanup");
  const users_ = [host.user, guest.user, stranger.user] as User[];
  await db.delete(events).where(inArray(events.id, created));
  await db.delete(agentProfiles).where(eq(agentProfiles.userId, host.user.id));
  for (const user of users_) {
    await db.delete(users).where(eq(users.id, user.id));
  }
  const strayInbox = await db
    .select()
    .from(agentInbox)
    .where(inArray(agentInbox.eventId, created));
  assert.equal(strayInbox.length, 0, "inbox rows should cascade with the event");
  ok("test rows removed and the new inbox cascade verified");

  console.log("\nHoneyMatcha meet/agent-events e2e passed.\n");
  process.exit(0);
}

main().catch((error) => {
  console.error("\nHoneyMatcha meet e2e FAILED:", error);
  process.exit(1);
});
