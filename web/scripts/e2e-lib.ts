import "dotenv/config";
import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { apiKeys, users } from "../src/db/schema";
import { acceptInviteLink, createInviteLink, listLinksForUser, revokeLinkForUser } from "../src/lib/links";
import { createSessionForUser, listMessagesForSession, postSessionMessage } from "../src/lib/sessions";
import { decideConfirm, listConfirmsForUser, requestConfirm } from "../src/lib/confirms";

function hashApiKey(rawKey: string) {
  return createHash("sha256").update(rawKey).digest("hex");
}

async function main() {
  const db = getDb();
  const suffix = randomBytes(3).toString("hex");
  const [alice] = await db.insert(users).values({
    clerkUserId: `clerk_alice_${suffix}`,
    email: `alice_${suffix}@example.com`,
    name: "Alice",
  }).returning();
  const [bob] = await db.insert(users).values({
    clerkUserId: `clerk_bob_${suffix}`,
    email: `bob_${suffix}@example.com`,
    name: "Bob",
  }).returning();

  const aliceRaw = `hm_${randomBytes(24).toString("base64url")}`;
  await db.insert(apiKeys).values({
    userId: alice.id,
    name: "alice",
    keyPrefix: aliceRaw.slice(0, 11),
    keyHash: hashApiKey(aliceRaw),
  });

  const origin = "http://localhost:3000";
  const invite = await createInviteLink({
    fromUser: alice,
    toEmail: bob.email,
    toName: "Bob",
    origin,
  });
  if (!invite.inviteUrl.includes("/invite/")) throw new Error("bad invite url");

  const accepted = await acceptInviteLink({
    user: bob,
    inviteCode: invite.inviteCode,
    origin,
  });
  if (accepted.link.status !== "active" || accepted.pair.status !== "active") {
    throw new Error("mutual links not active");
  }

  const aliceLinks = await listLinksForUser(alice, origin);
  if (!aliceLinks.some((l) => l.status === "active")) throw new Error("alice missing active");

  const session = await createSessionForUser({
    user: alice,
    intentType: "schedule_meeting",
    linkId: accepted.link.id,
  });
  await postSessionMessage({
    session: {
      id: session.id,
      intentType: session.intentType,
      initiatorUserId: session.initiatorUserId,
      peerUserId: session.peerUserId,
      linkId: session.linkId,
      status: session.status,
      payload: session.payload,
      createdAt: new Date(session.createdAt),
      updatedAt: new Date(session.updatedAt),
    },
    sender: bob,
    kind: "note",
    body: { text: "Free Thursday morning" },
  });
  const messages = await listMessagesForSession(session.id);
  if (!messages[0]?.plainEnglish.includes("Thursday")) throw new Error("plain english missing");

  const confirm = await requestConfirm({
    user: alice,
    sessionId: session.id,
    action: "book_meeting",
    note: "Thursday 9am",
  });
  const pending = await listConfirmsForUser(alice, "pending");
  if (!pending.some((c) => c.id === confirm.id)) throw new Error("pending missing");

  const decided = await decideConfirm({
    user: alice,
    confirmId: confirm.id,
    decision: "approved",
  });
  if (decided.status !== "approved") throw new Error("not approved");

  const board = await listMessagesForSession(session.id);
  if (!board.some((m) => m.kind === "confirm.approved")) throw new Error("no approve message");

  await revokeLinkForUser({ user: alice, linkId: accepted.link.id });
  const after = await listLinksForUser(alice, origin);
  if (after.some((l) => l.status === "active")) throw new Error("should be revoked");

  await db.delete(users).where(eq(users.id, alice.id));
  await db.delete(users).where(eq(users.id, bob.id));
  console.log(JSON.stringify({ ok: true, inviteCode: invite.inviteCode, sessionId: session.id, confirmId: confirm.id }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
