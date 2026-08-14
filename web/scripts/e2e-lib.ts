import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { apiKeys, users } from "../src/db/schema";
import {
  acceptInviteLink,
  approveConnectionRequest,
  createInviteLink,
  listLinksForUser,
  revokeLinkForUser,
} from "../src/lib/links";
import {
  createPublicInvite,
  getPublicInvitePreview,
  redeemPublicInvite,
  revokePublicInvite,
} from "../src/lib/public-invites";
import { createSessionForUser, listMessagesForSession, postSessionMessage } from "../src/lib/sessions";
import { decideConfirm, listConfirmsForUser, requestConfirm } from "../src/lib/confirms";
import { DEFAULT_AGENT_SCOPES } from "../src/lib/scopes";
import { syncUserIdentity } from "../src/lib/users";

function hashApiKey(rawKey: string) {
  return createHash("sha256").update(rawKey).digest("hex");
}

async function main() {
  const db = getDb();
  const suffix = randomBytes(3).toString("hex");
  const reconciliationEmail = `reconcile_${suffix}@example.com`;
  const [legacyIdentity] = await db.insert(users).values({
    clerkUserId: `clerk_old_${suffix}`,
    email: reconciliationEmail,
    name: "Old Identity",
  }).returning();
  const reconciledIdentity = await syncUserIdentity({
    clerkUserId: `clerk_current_${suffix}`,
    email: reconciliationEmail.toUpperCase(),
    name: "Current Identity",
  });
  if (
    reconciledIdentity.id !== legacyIdentity.id ||
    reconciledIdentity.clerkUserId !== `clerk_current_${suffix}`
  ) {
    throw new Error("same-email Clerk identity was not reconciled");
  }
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
  const [carol] = await db.insert(users).values({
    clerkUserId: `clerk_carol_${suffix}`,
    email: `carol_${suffix}@example.com`,
    name: "Carol",
  }).returning();
  const [dave] = await db.insert(users).values({
    clerkUserId: `clerk_dave_${suffix}`,
    email: `dave_${suffix}@example.com`,
    name: "Dave",
  }).returning();
  const [eve] = await db.insert(users).values({
    clerkUserId: `clerk_eve_${suffix}`,
    email: `eve_${suffix}@example.com`,
    name: "Eve",
  }).returning();

  const aliceRaw = `hm_${randomBytes(24).toString("base64url")}`;
  await db.insert(apiKeys).values({
    userId: alice.id,
    name: "alice",
    keyPrefix: aliceRaw.slice(0, 11),
    keyHash: hashApiKey(aliceRaw),
    scopes: DEFAULT_AGENT_SCOPES,
  });

  const origin = "http://localhost:3000";
  const publicInvite = await createPublicInvite({
    owner: alice,
    label: "E2E public QR",
    maxRedemptions: 2,
    expiresInHours: 24,
    origin,
  });
  const publicToken = decodeURIComponent(
    publicInvite.inviteUrl.split("/").at(-1) ?? "",
  );
  const preview = await getPublicInvitePreview(publicToken);
  if (
    preview?.ownerName !== "Alice" ||
    preview.remainingRedemptions !== 2
  ) {
    throw new Error("public invite preview should be safe and available");
  }
  const carolRequest = await redeemPublicInvite({
    user: carol,
    token: publicToken,
  });
  if (carolRequest.request.status !== "pending") {
    throw new Error("public redemption must remain pending");
  }
  const carolReplay = await redeemPublicInvite({
    user: carol,
    token: publicToken,
  });
  if (!carolReplay.idempotent) {
    throw new Error("public redemption replay should be idempotent");
  }
  const carolLinks = await listLinksForUser(carol, origin);
  const carolPending = carolLinks.find(
    (link) => link.id === carolRequest.request.id,
  );
  if (!carolPending) throw new Error("requester should see pending request");
  await assert.rejects(
    () =>
      acceptInviteLink({
        user: carol,
        inviteCode: carolPending.inviteCode,
        origin,
      }),
    /must be approved by the inviter/,
  );
  await redeemPublicInvite({ user: dave, token: publicToken });
  await assert.rejects(
    () => redeemPublicInvite({ user: eve, token: publicToken }),
    /no longer available|reached its limit/,
  );
  await assert.rejects(
    () =>
      approveConnectionRequest({
        user: carol,
        linkId: carolRequest.request.id,
        origin,
      }),
    /Only the public invite owner/,
  );
  const publicAccepted = await approveConnectionRequest({
    user: alice,
    linkId: carolRequest.request.id,
    origin,
  });
  if (
    publicAccepted.link.status !== "active" ||
    publicAccepted.pair.status !== "active"
  ) {
    throw new Error("approved public request should create mutual links");
  }
  await revokePublicInvite({
    owner: alice,
    publicInviteId: publicInvite.id,
  });
  if (await getPublicInvitePreview(publicToken)) {
    throw new Error("revoked public invite should not resolve");
  }

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
      idempotencyKey: null,
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
  if (
    after.some(
      (link) =>
        link.status === "active" &&
        (link.id === accepted.link.id || link.pairLinkId === accepted.pair.id),
    )
  ) {
    throw new Error("targeted relationship should be revoked");
  }

  await db.delete(users).where(eq(users.id, alice.id));
  await db.delete(users).where(eq(users.id, bob.id));
  await db.delete(users).where(eq(users.id, carol.id));
  await db.delete(users).where(eq(users.id, dave.id));
  await db.delete(users).where(eq(users.id, eve.id));
  await db.delete(users).where(eq(users.id, reconciledIdentity.id));
  console.log(JSON.stringify({ ok: true, inviteCode: invite.inviteCode, sessionId: session.id, confirmId: confirm.id }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
