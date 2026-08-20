import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  agentProfiles,
  links,
  publicInvites,
  users,
  type AllowedHours,
  type Link,
  type User,
} from "@/db/schema";
import { deliverDiscoveryInbox } from "@/lib/agent-inbox";
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
  publicInviteId: string | null;
  profileHandle: string | null;
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

  const [existingPending] = await db
    .select()
    .from(links)
    .where(
      and(
        eq(links.fromUserId, opts.fromUser.id),
        eq(links.toEmail, toEmail),
        eq(links.status, "pending"),
        or(isNull(links.expiresAt), gt(links.expiresAt, new Date())),
      ),
    )
    .orderBy(desc(links.createdAt))
    .limit(1);
  if (existingPending) {
    return toPublicLink(existingPending, opts.fromUser, opts.origin, null);
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
  const result = await db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(links)
      .where(and(eq(links.inviteCode, code), eq(links.status, "pending")))
      .limit(1);
    if (!invite) {
      throw Object.assign(new Error("Invite not found or not pending"), {
        status: 404,
      });
    }
    if (invite.publicInviteId) {
      throw Object.assign(
        new Error("Public connection requests must be approved by the inviter"),
        { status: 403 },
      );
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

    const [inviter] = await tx
      .select()
      .from(users)
      .where(eq(users.id, invite.fromUserId))
      .limit(1);
    if (!inviter) {
      throw Object.assign(new Error("Inviter no longer exists"), {
        status: 404,
      });
    }
    const [existingActive] = await tx
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
    if (existingActive) {
      throw Object.assign(new Error("Active link already exists"), {
        status: 409,
        linkId: existingActive.id,
      });
    }

    const now = new Date();
    const [claimed] = await tx
      .update(links)
      .set({
        toUserId: opts.user.id,
        toEmail: opts.user.email,
        toName: opts.user.name,
        status: "active",
        expiresAt: null,
        updatedAt: now,
      })
      .where(and(eq(links.id, invite.id), eq(links.status, "pending")))
      .returning();
    if (!claimed) {
      throw Object.assign(new Error("This invitation was already accepted"), {
        status: 409,
      });
    }

    const [pair] = await tx
      .insert(links)
      .values({
        fromUserId: opts.user.id,
        toUserId: inviter.id,
        toEmail: inviter.email,
        toName: inviter.name,
        inviteCode: generateInviteCode(),
        status: "active",
        scopes: invite.scopes,
        pairLinkId: claimed.id,
        confirmRequired: true,
        timezone: null,
        allowedHours: null,
        expiresAt: null,
        updatedAt: now,
      })
      .returning();
    if (!pair) {
      throw Object.assign(new Error("Could not activate connection"), {
        status: 503,
      });
    }
    const [activated] = await tx
      .update(links)
      .set({ pairLinkId: pair.id, updatedAt: now })
      .where(eq(links.id, claimed.id))
      .returning();
    return { activated, pair, inviter };
  });

  await writeAudit({
    actorUserId: opts.user.id,
    action: "invite.accepted",
    entityType: "link",
    entityId: result.activated.id,
    metadata: {
      inviteCode: code,
      pairLinkId: result.pair.id,
      fromUserId: result.inviter.id,
      toUserId: opts.user.id,
    },
  });

  return {
    link: toPublicLink(
      result.activated,
      opts.user,
      opts.origin,
      result.inviter,
    ),
    pair: toPublicLink(result.pair, opts.user, opts.origin, result.inviter),
  };
}

export async function approveConnectionRequest(opts: {
  user: User;
  linkId: string;
  origin: string;
}): Promise<{ link: PublicLink; pair: PublicLink }> {
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(links)
      .where(eq(links.id, opts.linkId))
      .limit(1);
    if (!request) {
      throw Object.assign(new Error("Connection request not found"), {
        status: 404,
      });
    }
    if (request.fromUserId !== opts.user.id) {
      throw Object.assign(
        new Error("Only the owner can approve this request"),
        { status: 403 },
      );
    }
    if (
      request.status !== "pending" ||
      !request.toUserId ||
      (!request.publicInviteId && !request.profileHandle)
    ) {
      throw Object.assign(new Error("This request is no longer pending"), {
        status: 409,
      });
    }
    if (request.expiresAt && request.expiresAt <= new Date()) {
      throw Object.assign(new Error("This request has expired"), {
        status: 410,
      });
    }
    if (request.publicInviteId) {
      const [sourceInvite] = await tx
        .select({ id: publicInvites.id })
        .from(publicInvites)
        .where(
          and(
            eq(publicInvites.id, request.publicInviteId),
            eq(publicInvites.status, "active"),
            gt(publicInvites.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!sourceInvite) {
        throw Object.assign(
          new Error("The public invitation was revoked or expired"),
          { status: 409 },
        );
      }
    }
    if (request.profileHandle) {
      const [sourceProfile] = await tx
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(
          and(
            eq(agentProfiles.userId, opts.user.id),
            eq(agentProfiles.handle, request.profileHandle),
            eq(agentProfiles.isPublished, true),
          ),
        )
        .limit(1);
      if (!sourceProfile) {
        throw Object.assign(
          new Error("This public agent page is no longer available"),
          { status: 409 },
        );
      }
    }

    const [requester] = await tx
      .select()
      .from(users)
      .where(eq(users.id, request.toUserId))
      .limit(1);
    if (!requester) {
      throw Object.assign(new Error("Requester no longer exists"), {
        status: 404,
      });
    }

    const [existingActive] = await tx
      .select({ id: links.id })
      .from(links)
      .where(
        and(
          eq(links.status, "active"),
          or(
            and(
              eq(links.fromUserId, opts.user.id),
              eq(links.toUserId, requester.id),
            ),
            and(
              eq(links.fromUserId, requester.id),
              eq(links.toUserId, opts.user.id),
            ),
          ),
        ),
      )
      .limit(1);
    if (existingActive) {
      throw Object.assign(new Error("Active link already exists"), {
        status: 409,
      });
    }

    const now = new Date();
    const [claimed] = await tx
      .update(links)
      .set({
        status: "active",
        confirmRequired: true,
        expiresAt: null,
        updatedAt: now,
      })
      .where(and(eq(links.id, request.id), eq(links.status, "pending")))
      .returning();
    if (!claimed) {
      throw Object.assign(new Error("This request was already handled"), {
        status: 409,
      });
    }

    const [pair] = await tx
      .insert(links)
      .values({
        fromUserId: requester.id,
        toUserId: opts.user.id,
        toEmail: opts.user.email,
        toName: opts.user.name,
        inviteCode: generateInviteCode(),
        status: "active",
        scopes: claimed.scopes,
        pairLinkId: claimed.id,
        confirmRequired: true,
        expiresAt: null,
        updatedAt: now,
      })
      .returning();
    if (!pair) {
      throw Object.assign(new Error("Could not activate connection"), {
        status: 503,
      });
    }

    const [activated] = await tx
      .update(links)
      .set({ pairLinkId: pair.id, updatedAt: now })
      .where(eq(links.id, claimed.id))
      .returning();
    return { activated, pair, requester };
  });

  await writeAudit({
    actorUserId: opts.user.id,
    action: result.activated.profileHandle
      ? "agent_profile.connection_approved"
      : "public_invite.request_approved",
    entityType: "link",
    entityId: result.activated.id,
    metadata: {
      publicInviteId: result.activated.publicInviteId,
      profileHandle: result.activated.profileHandle,
      requesterUserId: result.requester.id,
      pairLinkId: result.pair.id,
    },
  });
  if (result.activated.profileHandle) {
    await deliverDiscoveryInbox({
      userId: result.requester.id,
      kind: "profile.connection_approved",
      summary: `${opts.user.name || "A HoneyMatcha member"} approved the agent connection.`,
      body: {
        handle: result.activated.profileHandle,
        ownerUserId: opts.user.id,
        linkId: result.activated.id,
      },
    });
  }
  return {
    link: toPublicLink(result.activated, opts.user, opts.origin, result.requester),
    pair: toPublicLink(result.pair, opts.user, opts.origin, result.requester),
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
  if (link.status === "pending" && link.publicInviteId) {
    const revoked = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(links)
        .set({ status: "revoked", updatedAt: now })
        .where(and(eq(links.id, link.id), eq(links.status, "pending")))
        .returning({ id: links.id });
      if (!claimed) return false;
      await tx
        .update(publicInvites)
        .set({
          redemptionCount: sql`greatest(${publicInvites.redemptionCount} - 1, 0)`,
          updatedAt: now,
        })
        .where(eq(publicInvites.id, link.publicInviteId!));
      return true;
    });
    if (!revoked) {
      throw Object.assign(new Error("Connection request was already handled"), {
        status: 409,
      });
    }
    return { id: link.id, status: "revoked", revokedIds: [link.id] };
  }

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

  if (ids.length > 0) {
    await db
      .update(links)
      .set({ status: "revoked", updatedAt: now })
      .where(inArray(links.id, ids));
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

  // One query for every peer, not one query per peer.
  const peerMap = new Map<string, User>();
  if (peerIds.size > 0) {
    const found = await db
      .select()
      .from(users)
      .where(inArray(users.id, [...peerIds]));
    for (const row of found) peerMap.set(row.id, row);
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
        isNull(links.publicInviteId),
        isNull(links.profileHandle),
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
    publicInviteId: link.publicInviteId,
    profileHandle: link.profileHandle,
    confirmRequired: link.confirmRequired,
    timezone: link.timezone,
    allowedHours: link.allowedHours ?? null,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  };
}
