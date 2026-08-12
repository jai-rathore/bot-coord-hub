import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  links,
  users,
  type AllowedHours,
  type Link,
  type User,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import {
  DEFAULT_LINK_SCOPES,
  generateInviteCode,
  inviteUrlForCode,
} from "@/lib/invite";
import { normalizeLinkScopes } from "@/lib/scopes";
import { boundedText } from "@/lib/validation";

export type PublicLink = {
  id: string;
  status: Link["status"];
  scopes: string[];
  inviteCode: string;
  inviteUrl: string;
  direction: "outgoing" | "incoming";
  peer: { id: string; email: string; name: string | null } | null;
  toEmail: string | null;
  toName: string | null;
  pairLinkId: string | null;
  confirmRequired: boolean;
  timezone: string | null;
  allowedHours: AllowedHours | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export async function createInviteLink(opts: {
  fromUser: User;
  toEmail?: string | null;
  toName?: string | null;
  scopes?: string[];
  confirmRequired?: boolean;
  timezone?: string | null;
  allowedHours?: AllowedHours | null;
  expiresInHours?: number;
  origin: string;
}): Promise<PublicLink> {
  const toEmail = normalizeEmail(opts.toEmail);
  if (!toEmail) {
    throw Object.assign(
      new Error("A recipient email is required for a private invitation"),
      { status: 400 },
    );
  }
  if (!toEmail.includes("@")) {
    throw Object.assign(new Error("toEmail must be a valid email"), {
      status: 400,
    });
  }
  if (toEmail && toEmail === opts.fromUser.email.toLowerCase()) {
    throw Object.assign(new Error("Cannot invite yourself"), { status: 400 });
  }

  const scopes = normalizeLinkScopes(
    opts.scopes?.length ? opts.scopes : [...DEFAULT_LINK_SCOPES],
  );
  const toName =
    boundedText(opts.toName, "toName", 80) ?? null;
  const expiresInHours = Math.min(
    Math.max(Number(opts.expiresInHours ?? 7 * 24), 1),
    30 * 24,
  );
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1_000);

  const db = getDb();
  const inviteCode = generateInviteCode();

  let toUserId: string | null = null;
  let resolvedName = toName;
  if (toEmail) {
    const peer = await db
      .select()
      .from(users)
      .where(eq(users.email, toEmail))
      .limit(1);
    if (peer[0]) {
      toUserId = peer[0].id;
      resolvedName = resolvedName || peer[0].name;
    }
  }

  const [created] = await db
    .insert(links)
    .values({
      fromUserId: opts.fromUser.id,
      toUserId,
      toEmail,
      toName: resolvedName,
      inviteCode,
      status: "pending",
      scopes,
      confirmRequired: opts.confirmRequired ?? true,
      timezone: opts.timezone ?? null,
      allowedHours: opts.allowedHours ?? null,
      expiresAt,
    })
    .returning();

  return toPublicLink(created, opts.fromUser, opts.origin, null);
}

export async function updateLinkPolicyForUser(opts: {
  user: User;
  linkId: string;
  confirmRequired?: boolean;
  timezone?: string | null;
  allowedHours?: AllowedHours | null;
  origin: string;
}): Promise<PublicLink> {
  const db = getDb();
  const [link] = await db
    .select()
    .from(links)
    .where(eq(links.id, opts.linkId))
    .limit(1);
  if (!link) {
    throw Object.assign(new Error("Link not found"), { status: 404 });
  }
  if (link.fromUserId !== opts.user.id) {
    throw Object.assign(
      new Error("Only the person who owns these preferences can change them"),
      { status: 403 },
    );
  }

  const [updated] = await db
    .update(links)
    .set({
      ...(opts.confirmRequired !== undefined
        ? { confirmRequired: opts.confirmRequired }
        : {}),
      ...(opts.timezone !== undefined ? { timezone: opts.timezone } : {}),
      ...(opts.allowedHours !== undefined
        ? { allowedHours: opts.allowedHours }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(links.id, opts.linkId))
    .returning();

  return toPublicLink(updated, opts.user, opts.origin, null);
}

export async function acceptInviteLink(opts: {
  user: User;
  inviteCode: string;
  origin: string;
}): Promise<{ link: PublicLink; pair: PublicLink }> {
  const code = opts.inviteCode.trim();
  if (!code) {
    throw Object.assign(new Error("inviteCode is required"), { status: 400 });
  }

  const db = getDb();
  const pending = await db
    .select()
    .from(links)
    .where(and(eq(links.inviteCode, code), eq(links.status, "pending")))
    .limit(1);

  const invite = pending[0];
  if (!invite) {
    throw Object.assign(new Error("Invite not found or not pending"), {
      status: 404,
    });
  }
  if (invite.expiresAt && invite.expiresAt <= new Date()) {
    throw Object.assign(new Error("This invitation has expired"), {
      status: 410,
    });
  }
  if (invite.fromUserId === opts.user.id) {
    throw Object.assign(new Error("Cannot accept your own invite"), {
      status: 400,
    });
  }

  const targeted = normalizeEmail(invite.toEmail);
  if (targeted && targeted !== opts.user.email.toLowerCase()) {
    throw Object.assign(
      new Error("This invite is addressed to a different email"),
      { status: 403 },
    );
  }

  const inviterRows = await db
    .select()
    .from(users)
    .where(eq(users.id, invite.fromUserId))
    .limit(1);
  const inviter = inviterRows[0];
  if (!inviter) {
    throw Object.assign(new Error("Inviter no longer exists"), { status: 404 });
  }

  // Avoid duplicate active links between the same pair.
  const existingActive = await db
    .select()
    .from(links)
    .where(
      and(
        eq(links.status, "active"),
        or(
          and(
            eq(links.fromUserId, invite.fromUserId),
            eq(links.toUserId, opts.user.id),
          ),
          and(
            eq(links.fromUserId, opts.user.id),
            eq(links.toUserId, invite.fromUserId),
          ),
        ),
      ),
    )
    .limit(1);
  if (existingActive[0]) {
    throw Object.assign(new Error("Active link already exists"), {
      status: 409,
      linkId: existingActive[0].id,
    });
  }

  const now = new Date();
  const pairCode = generateInviteCode();

  const [pair] = await db
    .insert(links)
    .values({
      fromUserId: opts.user.id,
      toUserId: inviter.id,
      toEmail: inviter.email,
      toName: inviter.name,
      inviteCode: pairCode,
      status: "active",
      scopes: invite.scopes,
      confirmRequired: true,
      timezone: null,
      allowedHours: null,
      expiresAt: null,
      updatedAt: now,
    })
    .returning();

  const [activated] = await db
    .update(links)
    .set({
      toUserId: opts.user.id,
      toEmail: opts.user.email,
      toName: opts.user.name,
      status: "active",
      pairLinkId: pair.id,
      expiresAt: null,
      updatedAt: now,
    })
    .where(eq(links.id, invite.id))
    .returning();

  await db
    .update(links)
    .set({ pairLinkId: activated.id, updatedAt: now })
    .where(eq(links.id, pair.id));

  const pairWithPairId = { ...pair, pairLinkId: activated.id };

  await writeAudit({
    actorUserId: opts.user.id,
    action: "invite.accepted",
    entityType: "link",
    entityId: activated.id,
    metadata: {
      inviteCode: code,
      pairLinkId: pair.id,
      fromUserId: inviter.id,
      toUserId: opts.user.id,
    },
  });

  return {
    link: toPublicLink(activated, opts.user, opts.origin, inviter),
    pair: toPublicLink(pairWithPairId, opts.user, opts.origin, inviter),
  };
}

export async function revokeLinkForUser(opts: {
  user: User;
  linkId: string;
}): Promise<{ id: string; status: "revoked"; revokedIds: string[] }> {
  const db = getDb();
  const rows = await db
    .select()
    .from(links)
    .where(eq(links.id, opts.linkId))
    .limit(1);
  const link = rows[0];
  if (!link) {
    throw Object.assign(new Error("Link not found"), { status: 404 });
  }
  if (link.fromUserId !== opts.user.id && link.toUserId !== opts.user.id) {
    throw Object.assign(new Error("Not a party on this link"), { status: 403 });
  }

  const now = new Date();
  const ids = [link.id];
  if (link.pairLinkId) ids.push(link.pairLinkId);

  // Also revoke any active mirror found by swapped users.
  if (link.toUserId) {
    const mirrors = await db
      .select({ id: links.id })
      .from(links)
      .where(
        and(
          eq(links.fromUserId, link.toUserId),
          eq(links.toUserId, link.fromUserId),
          eq(links.status, "active"),
        ),
      );
    for (const m of mirrors) {
      if (!ids.includes(m.id)) ids.push(m.id);
    }
  }

  for (const id of ids) {
    await db
      .update(links)
      .set({ status: "revoked", updatedAt: now })
      .where(eq(links.id, id));
  }

  return { id: link.id, status: "revoked", revokedIds: ids };
}

export async function listLinksForUser(
  user: User,
  origin: string,
): Promise<PublicLink[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(links)
    .where(or(eq(links.fromUserId, user.id), eq(links.toUserId, user.id)))
    .orderBy(desc(links.createdAt));

  const peerIds = new Set<string>();
  for (const row of rows) {
    if (row.fromUserId !== user.id) peerIds.add(row.fromUserId);
    if (row.toUserId && row.toUserId !== user.id) peerIds.add(row.toUserId);
  }

  const peerMap = new Map<string, User>();
  if (peerIds.size > 0) {
    for (const id of peerIds) {
      const found = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (found[0]) peerMap.set(id, found[0]);
    }
  }

  // Prefer the outgoing perspective for active mutual pairs; keep pending invites.
  const seenActivePeers = new Set<string>();
  const result: PublicLink[] = [];

  for (const row of rows) {
    const peerId =
      row.fromUserId === user.id ? row.toUserId : row.fromUserId;
    const peer = peerId ? peerMap.get(peerId) ?? null : null;

    if (row.status === "active" && peerId) {
      if (seenActivePeers.has(peerId)) continue;
      // Prefer the row where the current user is fromUser (outgoing mirror).
      if (row.fromUserId !== user.id) {
        const hasOutgoing = rows.some(
          (r) =>
            r.status === "active" &&
            r.fromUserId === user.id &&
            r.toUserId === peerId,
        );
        if (hasOutgoing) continue;
      }
      seenActivePeers.add(peerId);
    }

    result.push(toPublicLink(row, user, origin, peer));
  }

  return result;
}

export async function getPendingInviteByCode(inviteCode: string) {
  const db = getDb();
  const rows = await db
    .select({
      link: links,
      inviter: users,
    })
    .from(links)
    .innerJoin(users, eq(links.fromUserId, users.id))
    .where(
      and(
        eq(links.inviteCode, inviteCode),
        eq(links.status, "pending"),
        or(isNull(links.expiresAt), gt(links.expiresAt, new Date())),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

function toPublicLink(
  link: Link,
  viewer: User,
  origin: string,
  peer: User | null,
): PublicLink {
  const direction: "outgoing" | "incoming" =
    link.fromUserId === viewer.id ? "outgoing" : "incoming";

  let resolvedPeer = peer;
  if (!resolvedPeer && link.fromUserId !== viewer.id) {
    // peer filled by caller when available
    resolvedPeer = null;
  }

  return {
    id: link.id,
    status: link.status,
    scopes: link.scopes ?? [],
    inviteCode: link.inviteCode,
    inviteUrl: inviteUrlForCode(origin, link.inviteCode),
    direction,
    peer: resolvedPeer
      ? {
          id: resolvedPeer.id,
          email: resolvedPeer.email,
          name: resolvedPeer.name,
        }
      : link.toUserId && link.toUserId !== viewer.id
        ? {
            id: link.toUserId,
            email: link.toEmail ?? "unknown",
            name: link.toName,
          }
        : null,
    toEmail: link.toEmail,
    toName: link.toName,
    pairLinkId: link.pairLinkId,
    confirmRequired: link.confirmRequired,
    timezone: link.timezone,
    allowedHours: link.allowedHours ?? null,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  };
}
