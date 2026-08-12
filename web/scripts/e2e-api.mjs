/**
 * End-to-end API smoke: invite → accept → session message → confirm decide.
 * Hits running Next server (default http://127.0.0.1:3000).
 */
import "dotenv/config";
import { createHash, randomBytes } from "crypto";
import postgres from "postgres";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}
const sql = postgres(url, { max: 1 });
const safeScopes = [
  "profile:read",
  "people:read",
  "people:write",
  "tasks:read",
  "tasks:write",
  "approvals:read",
  "guest_tasks:read",
  "guest_tasks:write",
  "intents:read",
  "intents:request",
];

function hashApiKey(rawKey) {
  return createHash("sha256").update(rawKey).digest("hex");
}

async function jsonFetch(path, { method = "GET", token, body } = {}) {
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
  if (!cond) throw new Error(msg);
}

async function main() {
  const suffix = randomBytes(3).toString("hex");
  const [alice] = await sql`
    insert into users (clerk_user_id, email, name)
    values (${`clerk_alice_${suffix}`}, ${`alice_${suffix}@example.com`}, ${"Alice"})
    returning *
  `;
  const [bob] = await sql`
    insert into users (clerk_user_id, email, name)
    values (${`clerk_bob_${suffix}`}, ${`bob_${suffix}@example.com`}, ${"Bob"})
    returning *
  `;

  const aliceRaw = `hm_${randomBytes(24).toString("base64url")}`;
  const bobRaw = `hm_${randomBytes(24).toString("base64url")}`;
  await sql`
    insert into api_keys (user_id, name, key_prefix, key_hash, scopes)
    values
      (${alice.id}, ${"alice"}, ${aliceRaw.slice(0, 11)}, ${hashApiKey(aliceRaw)}, ${sql.json(safeScopes)}),
      (${bob.id}, ${"bob"}, ${bobRaw.slice(0, 11)}, ${hashApiKey(bobRaw)}, ${sql.json(safeScopes)})
  `;

  const me = await jsonFetch("/api/v1/me", { token: aliceRaw });
  assert(me.res.ok, `me failed: ${JSON.stringify(me.data)}`);

  const invite = await jsonFetch("/api/v1/links/invite", {
    method: "POST",
    token: aliceRaw,
    body: { toEmail: bob.email, toName: "Bob" },
  });
  assert(invite.res.status === 201, `invite failed: ${JSON.stringify(invite.data)}`);
  assert(
    String(invite.data.message || "").includes("friend"),
    "invite copy should mention friend",
  );
  assert(
    String(invite.data.link.inviteUrl || "").includes("/invite/"),
    "inviteUrl should be /invite/{code}",
  );
  const code = invite.data.link.inviteCode;

  const accept = await jsonFetch("/api/v1/links/accept", {
    method: "POST",
    token: bobRaw,
    body: { inviteCode: code },
  });
  assert(accept.res.ok, `accept failed: ${JSON.stringify(accept.data)}`);
  assert(accept.data.link.status === "active", "accepted link should be active");
  assert(accept.data.pair?.status === "active", "pair link should be active");

  const aliceLinks = await jsonFetch("/api/v1/links", { token: aliceRaw });
  assert(aliceLinks.res.ok, "list links failed");
  assert(
    aliceLinks.data.links.some((l) => l.status === "active"),
    "alice should see active link",
  );

  const session = await jsonFetch("/api/v1/sessions", {
    method: "POST",
    token: aliceRaw,
    body: {
      intentType: "schedule_meeting",
      linkId: accept.data.link.id,
      payload: { title: "Sync" },
    },
  });
  assert(session.res.status === 201, `session create failed: ${JSON.stringify(session.data)}`);
  const sessionId = session.data.session.id;

  const post = await jsonFetch(`/api/v1/sessions/${sessionId}/messages`, {
    method: "POST",
    token: bobRaw,
    body: { kind: "note", text: "I can do Tuesday afternoon" },
  });
  assert(post.res.status === 201, `post message failed: ${JSON.stringify(post.data)}`);
  assert(
    String(post.data.message.plainEnglish || "").includes("Tuesday"),
    "plain English should include note text",
  );

  const board = await jsonFetch(`/api/v1/sessions/${sessionId}/board`, {
    token: aliceRaw,
  });
  assert(board.res.ok && board.data.messages.length >= 1, "board should be readable");

  const confirm = await jsonFetch("/api/v1/confirms", {
    method: "POST",
    token: aliceRaw,
    body: {
      sessionId,
      action: "book_meeting",
      note: "Book Tuesday 2pm",
      metadata: { start: "2026-08-18T21:00:00Z" },
    },
  });
  assert(confirm.res.status === 201, `confirm request failed: ${JSON.stringify(confirm.data)}`);

  const pending = await jsonFetch("/api/v1/confirms?status=pending", {
    token: aliceRaw,
  });
  assert(
    pending.data.confirms.some((c) => c.id === confirm.data.confirm.id),
    "pending confirm should list",
  );

  const respond = await jsonFetch("/api/v1/confirms/respond", {
    method: "POST",
    token: aliceRaw,
    body: {
      confirmId: confirm.data.confirm.id,
      action: "approve",
      note: "Looks good",
    },
  });
  assert(
    respond.res.status === 403,
    "default agent must not approve for a human",
  );
  await sql`
    update confirms
    set status = 'approved', decided_at = now()
    where id = ${confirm.data.confirm.id}
  `;

  const after = await jsonFetch("/api/v1/confirms?status=pending", {
    token: aliceRaw,
  });
  assert(
    !after.data.confirms.some((c) => c.id === confirm.data.confirm.id),
    "approved confirm should leave pending list",
  );

  // MCP/docs surfaces still reachable
  const docs = await fetch(`${base}/docs`);
  assert(docs.ok, "docs page should load");
  const openapi = await jsonFetch("/api/v1/openapi");
  assert(openapi.res.ok, "openapi should load");

  console.log(
    JSON.stringify(
      {
        ok: true,
        inviteCode: code,
        inviteUrl: invite.data.link.inviteUrl,
        sessionId,
        confirmId: confirm.data.confirm.id,
        messageCount: board.data.messages.length,
      },
      null,
      2,
    ),
  );

  await sql`delete from users where id in (${alice.id}, ${bob.id})`;
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
});
