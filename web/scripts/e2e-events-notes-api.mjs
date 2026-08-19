/**
 * Agent-facing end-to-end for event notes.
 *
 * Sage can leave a note; an external agent must be able to do the same thing
 * through the REST/MCP surface, and must hit exactly the same walls. This
 * drives real HTTP against a running server, so it covers the route wiring,
 * the Bearer scope checks, and the visibility downgrade — the parts a unit
 * test cannot reach.
 *
 *   DATABASE_URL=... node scripts/e2e-events-notes-api.mjs   (server on :3000)
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const sql = postgres(url, { max: 1 });

const WRITE_SCOPES = ["events:read", "events:write"];
const READ_ONLY_SCOPES = ["events:read"];

function hashApiKey(rawKey) {
  return createHash("sha256").update(rawKey).digest("hex");
}

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function mkUser(tag, suffix) {
  const [row] = await sql`
    insert into users (clerk_user_id, email, name)
    values (${`clerk_${tag}_${suffix}`}, ${`${tag}_${suffix}@example.com`}, ${tag})
    returning id, email, name
  `;
  return row;
}

async function mkKey(userId, scopes) {
  const raw = `hm_test_${randomBytes(18).toString("hex")}`;
  await sql`
    insert into api_keys (user_id, name, key_prefix, key_hash, scopes)
    values (${userId}, ${"agent"}, ${raw.slice(0, 11)}, ${hashApiKey(raw)}, ${sql.json(scopes)})
  `;
  return raw;
}

async function main() {
  const suffix = randomBytes(4).toString("hex");

  const organizer = await mkUser("org", suffix);
  const alice = await mkUser("alice", suffix);
  const bob = await mkUser("bob", suffix);

  const orgToken = await mkKey(organizer.id, WRITE_SCOPES);
  const aliceToken = await mkKey(alice.id, WRITE_SCOPES);
  const bobToken = await mkKey(bob.id, WRITE_SCOPES);
  const aliceReadOnly = await mkKey(alice.id, READ_ONLY_SCOPES);

  const soon = Date.now() + 72 * 3600_000;

  console.log("\n1. An agent can leave a note on an open event");
  const { data: created } = await api("/api/v1/events", {
    method: "POST",
    token: orgToken,
    body: {
      title: `AgentNotes ${suffix}`,
      timezone: "UTC",
      visibility: "open",
      deadlineAt: new Date(soon).toISOString(),
      slots: [{ startsAt: new Date(soon + 24 * 3600_000).toISOString() }],
    },
  });
  assert(
    created?.event?.id,
    `the organizer's agent created an event (server said: ${JSON.stringify(created)})`,
  );
  const eventId = created.event.id;

  const posted = await api(`/api/v1/events/${eventId}/notes`, {
    method: "POST",
    token: aliceToken,
    body: { body: "Can't do Friday — intern last-day lunch." },
  });
  assert(posted.res.status === 200 && posted.data.ok, "Alice's agent posted a note");
  assert(
    posted.data.audience === "everyone",
    "on an open board it stays visible to everyone",
  );
  assert(posted.data.notice === null, "and no downgrade notice is returned");
  const noteId = posted.data.noteId;
  assert(Boolean(noteId), "the response carries the note id for later retraction");

  console.log("\n2. Posting joins the human, exactly as responding does");
  const { data: aliceBoard } = await api(`/api/v1/events/${eventId}`, {
    token: aliceToken,
  });
  assert(
    aliceBoard.board.viewer.role === "participant",
    "Alice is a participant now without a separate join_event call",
  );

  console.log("\n3. Another agent reads it off the board, attributed");
  const { data: bobBoard } = await api(`/api/v1/events/${eventId}`, {
    token: bobToken,
  });
  const seen = bobBoard.board.notes ?? [];
  assert(seen.length === 1, "Bob's agent sees exactly the one shared note");
  assert(seen[0].body.includes("intern"), "with the body intact");
  assert(seen[0].isMine === false, "not marked as his own");
  assert(seen[0].canRetract === false, "and he cannot retract it");
  assert(
    typeof bobBoard.board.notesSummary === "string" ||
      bobBoard.board.notesSummary === null,
    "the rollup field is present on the agent payload",
  );
  assert(
    /post_event_note|board\.notes/.test(bobBoard.agent_instructions ?? ""),
    "the agent instructions point at notes so the capability is discoverable",
  );

  console.log("\n4. An organizer-only note stays out of another agent's board");
  await api(`/api/v1/events/${eventId}/notes`, {
    method: "POST",
    token: aliceToken,
    body: { body: "SECRETBUDGET is this on the team budget?", audience: "organizer" },
  });
  const { data: bobAgain } = await api(`/api/v1/events/${eventId}`, {
    token: bobToken,
  });
  assert(
    !JSON.stringify(bobAgain).includes("SECRETBUDGET"),
    "the private note never reaches another participant's agent payload",
  );
  const { data: orgSees } = await api(`/api/v1/events/${eventId}`, {
    token: orgToken,
  });
  assert(
    JSON.stringify(orgSees).includes("SECRETBUDGET"),
    "but the organizer's agent does read it",
  );

  console.log("\n5. events:write is required to post");
  const refused = await api(`/api/v1/events/${eventId}/notes`, {
    method: "POST",
    token: aliceReadOnly,
    body: { body: "posting without the write scope" },
  });
  assert(
    refused.res.status === 403,
    `a read-only key is refused (got ${refused.res.status})`,
  );
  const anonymous = await api(`/api/v1/events/${eventId}/notes`, {
    method: "POST",
    body: { body: "no bearer at all" },
  });
  assert(
    anonymous.res.status === 401,
    `an unauthenticated call is refused (got ${anonymous.res.status})`,
  );

  console.log("\n6. A private board downgrades an agent's note too");
  const { data: blind } = await api("/api/v1/events", {
    method: "POST",
    token: orgToken,
    body: {
      title: `AgentBlind ${suffix}`,
      timezone: "UTC",
      visibility: "blind",
      deadlineAt: new Date(soon).toISOString(),
      slots: [{ startsAt: new Date(soon + 24 * 3600_000).toISOString() }],
    },
  });
  const blindPost = await api(`/api/v1/events/${blind.event.id}/notes`, {
    method: "POST",
    token: aliceToken,
    body: { body: "Friday is out for me.", audience: "everyone" },
  });
  assert(
    blindPost.data.audience === "organizer",
    "an 'everyone' note becomes organizer-only on a blind board",
  );
  assert(
    typeof blindPost.data.notice === "string" && blindPost.data.notice.length > 0,
    "and the agent is told, so it cannot promise its human otherwise",
  );
  const { data: blindBob } = await api(`/api/v1/events/${blind.event.id}`, {
    token: bobToken,
  });
  assert(
    (blindBob.board.notes ?? []).length === 0,
    "no prose crosses a blind board to another agent",
  );

  console.log("\n7. Retraction is the author's, removal is the organizer's");
  const strangerRetract = await api(
    `/api/v1/events/${eventId}/notes?noteId=${noteId}`,
    { method: "DELETE", token: bobToken },
  );
  assert(
    strangerRetract.res.status === 403,
    `Bob's agent cannot retract Alice's note (got ${strangerRetract.res.status})`,
  );

  const ownRetract = await api(
    `/api/v1/events/${eventId}/notes?noteId=${noteId}`,
    { method: "DELETE", token: aliceToken },
  );
  assert(ownRetract.data.ok, "Alice's own agent can");
  assert(ownRetract.data.removedAs === "author", "and it is recorded as the author");

  const { data: afterRetract } = await api(`/api/v1/events/${eventId}`, {
    token: bobToken,
  });
  assert(
    (afterRetract.board.notes ?? []).length === 0,
    "and it leaves every other agent's board",
  );

  console.log("\n8. A bogus note id is refused, not silently ignored");
  const bogus = await api(
    `/api/v1/events/${eventId}/notes?noteId=${randomUUID()}`,
    { method: "DELETE", token: aliceToken },
  );
  assert(bogus.res.status === 404, `an unknown note id 404s (got ${bogus.res.status})`);

  const empty = await api(`/api/v1/events/${eventId}/notes`, {
    method: "POST",
    token: aliceToken,
    body: { body: "   " },
  });
  assert(empty.res.status === 400, `an empty note is refused (got ${empty.res.status})`);

  const badAudience = await api(`/api/v1/events/${eventId}/notes`, {
    method: "POST",
    token: aliceToken,
    body: { body: "fine", audience: "the_whole_internet" },
  });
  assert(
    badAudience.res.status === 400,
    `an unknown audience is refused (got ${badAudience.res.status})`,
  );

  console.log("\n9. Cleanup");
  await sql`delete from users where id in (${organizer.id}, ${alice.id}, ${bob.id})`;
  console.log("  ✓ test rows removed");

  console.log("\nAgent notes API e2e passed.\n");
  await sql.end();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("\ne2e-events-notes-api failed:", error);
  await sql.end().catch(() => {});
  process.exit(1);
});
