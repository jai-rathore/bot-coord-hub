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
  console.log("\n11. Cleanup");
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
