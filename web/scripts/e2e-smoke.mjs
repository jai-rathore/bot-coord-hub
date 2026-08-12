/**
 * DB-backed smoke test for links → activity → confirms (no Clerk).
 * Uses lib-equivalent SQL via the Next app's postgres client patterns.
 */
import "dotenv/config";
import { createHash, randomBytes } from "crypto";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

function hashApiKey(rawKey) {
  return createHash("sha256").update(rawKey).digest("hex");
}

function inviteCode() {
  const part = () =>
    randomBytes(3)
      .toString("base64url")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4);
  return `HM-${part()}-${part()}`;
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
    insert into api_keys (user_id, name, key_prefix, key_hash)
    values
      (${alice.id}, ${"alice"}, ${aliceRaw.slice(0, 11)}, ${hashApiKey(aliceRaw)}),
      (${bob.id}, ${"bob"}, ${bobRaw.slice(0, 11)}, ${hashApiKey(bobRaw)})
  `;

  const code = inviteCode();
  const [invite] = await sql`
    insert into links (from_user_id, to_email, invite_code, status, scopes)
    values (${alice.id}, ${bob.email}, ${code}, ${"pending"}, ${sql.json(["schedule_meeting"])})
    returning *
  `;

  // accept → mutual rows
  const pairCode = inviteCode();
  const [pair] = await sql`
    insert into links (from_user_id, to_user_id, to_email, to_name, invite_code, status, scopes)
    values (${bob.id}, ${alice.id}, ${alice.email}, ${alice.name}, ${pairCode}, ${"active"}, ${sql.json(["schedule_meeting"])})
    returning *
  `;
  const [activated] = await sql`
    update links
    set to_user_id = ${bob.id}, status = ${"active"}, pair_link_id = ${pair.id}, updated_at = now()
    where id = ${invite.id}
    returning *
  `;
  await sql`update links set pair_link_id = ${activated.id} where id = ${pair.id}`;

  const activeForAlice = await sql`
    select * from links
    where status = 'active' and (from_user_id = ${alice.id} or to_user_id = ${alice.id})
  `;
  assert(activeForAlice.length >= 1, "Alice should see active link");

  const [session] = await sql`
    insert into sessions (intent_type, initiator_user_id, peer_user_id, link_id, status, payload)
    values (${"schedule_meeting"}, ${alice.id}, ${bob.id}, ${activated.id}, ${"open"}, ${sql.json({})})
    returning *
  `;

  await sql`
    insert into session_messages (session_id, sender_user_id, kind, body)
    values (
      ${session.id},
      ${alice.id},
      ${"note"},
      ${sql.json({ text: "Looking for 30m next week" })}
    )
  `;

  const messages = await sql`
    select * from session_messages where session_id = ${session.id}
  `;
  assert(messages.length === 1, "session should have a message");

  const [confirm] = await sql`
    insert into confirms (session_id, user_id, action, note, metadata, status)
    values (
      ${session.id},
      ${alice.id},
      ${"book_meeting"},
      ${"Book Tuesday 10:00"},
      ${sql.json({ start: "2026-08-18T17:00:00Z" })},
      ${"pending"}
    )
    returning *
  `;

  const [approved] = await sql`
    update confirms
    set status = ${"approved"}, decided_at = now()
    where id = ${confirm.id}
    returning *
  `;
  assert(approved.status === "approved", "confirm should be approved");

  await sql`
    insert into session_messages (session_id, sender_user_id, kind, body)
    values (
      ${session.id},
      ${alice.id},
      ${"confirm.approved"},
      ${sql.json({ text: "Approved: book_meeting", action: "book_meeting" })}
    )
  `;

  const pending = await sql`
    select * from confirms where user_id = ${alice.id} and status = 'pending'
  `;
  assert(pending.length === 0, "no pending confirms left");

  console.log(
    JSON.stringify(
      {
        ok: true,
        inviteCode: code,
        linkId: activated.id,
        pairLinkId: pair.id,
        sessionId: session.id,
        confirmId: confirm.id,
        aliceKeyPrefix: aliceRaw.slice(0, 11),
        bobKeyPrefix: bobRaw.slice(0, 11),
      },
      null,
      2,
    ),
  );

  // cleanup test rows
  await sql`delete from users where id in (${alice.id}, ${bob.id})`;
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
});
