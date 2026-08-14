import { and, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  links,
  publicInvites,
  users,
  type PublicInvite,
  type User,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { AgentApiError } from "@/lib/agent-errors";
import { generateInviteCode } from "@/lib/invite";
import {
  publicInviteIdFromToken,
  publicInviteUrlForId,
} from "@/lib/public-invite-token";
import { DEFAULT_LINK_SCOPES } from "@/lib/invite";
import { normalizeLinkScopes } from "@/lib/scopes";
import { boundedText } from "@/lib/validation";

const MAX_ACTIVE_PUBLIC_INVITES = 5;
const DEFAULT_MAX_REDEMPTIONS = 25;
const MAX_REDEMPTIONS = 100;
const DEFAULT_EXPIRES_HOURS = 30 * 24;

export type PublicInviteView = {
  id: string;
  label: string | null;
  status: PublicInvite["status"];
  inviteUrl: string;
  scopes: string[];
  confirmRequired: boolean;
  expiresAt: string;
  maxRedemptions: number;
  redemptionCount: number;
  remainingRedemptions: number;
  createdAt: string;
  revokedAt: string | null;
};

export type PublicInvitePreview = {
  id: string;
  ownerUserId: string;
  ownerName: string;
  label: string | null;
  expiresAt: string;
  remainingRedemptions: number;
};

function boundedInteger(
  value: unknown,
  field: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AgentApiError(
      400,
      `${field} must be an integer between ${min} and ${max}`,
    );
  }
  return parsed;
}

function toView(
  invite: PublicInvite,
  origin: string,
): PublicInviteView {
  return {
    id: invite.id,
    label: invite.label,
    status: invite.status,
    inviteUrl: publicInviteUrlForId(origin, invite.id),
    scopes: invite.scopes ?? [],
    confirmRequired: invite.confirmRequired,
    expiresAt: invite.expiresAt.toISOString(),
    maxRedemptions: invite.maxRedemptions,
    redemptionCount: invite.redemptionCount,
    remainingRedemptions: Math.max(
      0,
      invite.maxRedemptions - invite.redemptionCount,
    ),
    createdAt: invite.createdAt.toISOString(),
    revokedAt: invite.revokedAt?.toISOString() ?? null,
  };
}

export async function createPublicInvite(opts: {
  owner: User;
  label?: unknown;
  scopes?: unknown;
  confirmRequired?: boolean;
  expiresInHours?: unknown;
  maxRedemptions?: unknown;
  origin: string;
}): Promise<PublicInviteView> {
  const label = boundedText(opts.label, "label", 80) ?? null;
  const scopes = normalizeLinkScopes(
    Array.isArray(opts.scopes) && opts.scopes.length
      ? opts.scopes
      : [...DEFAULT_LINK_SCOPES],
  );
  const expiresInHours = boundedInteger(
    opts.expiresInHours,
    "expiresInHours",
    DEFAULT_EXPIRES_HOURS,
    1,
    30 * 24,
  );
  const maxRedemptions = boundedInteger(
    opts.maxRedemptions,
    "maxRedemptions",
    DEFAULT_MAX_REDEMPTIONS,
    1,
    MAX_REDEMPTIONS,
  );
  const now = new Date();
  const db = getDb();
  const active = await db
    .select({ id: publicInvites.id })
    .from(publicInvites)
    .where(
      and(
        eq(publicInvites.ownerUserId, opts.owner.id),
        eq(publicInvites.status, "active"),
        gt(publicInvites.expiresAt, now),
        lt(publicInvites.redemptionCount, publicInvites.maxRedemptions),
      ),
    )
    .limit(MAX_ACTIVE_PUBLIC_INVITES);
  if (active.length >= MAX_ACTIVE_PUBLIC_INVITES) {
    throw new AgentApiError(
      409,
      `You can have at most ${MAX_ACTIVE_PUBLIC_INVITES} active public invites`,
    );
  }

  const [created] = await db
    .insert(publicInvites)
    .values({
      ownerUserId: opts.owner.id,
      label,
      scopes,
      confirmRequired: opts.confirmRequired ?? true,
      expiresAt: new Date(now.getTime() + expiresInHours * 60 * 60 * 1_000),
      maxRedemptions,
    })
    .returning();
  if (!created) throw new AgentApiError(503, "Could not create public invite");

  await writeAudit({
    actorUserId: opts.owner.id,
    action: "public_invite.created",
    entityType: "public_invite",
    entityId: created.id,
    metadata: {
      maxRedemptions,
      expiresAt: created.expiresAt.toISOString(),
      scopes,
    },
  });
  return toView(created, opts.origin);
}

export async function listPublicInvites(
  owner: User,
  origin: string,
): Promise<PublicInviteView[]> {
  const rows = await getDb()
    .select()
    .from(publicInvites)
    .where(eq(publicInvites.ownerUserId, owner.id))
    .orderBy(desc(publicInvites.createdAt));
  return rows.map((row) => toView(row, origin));
}

export async function getPublicInvitePreview(
  token: string,
): Promise<PublicInvitePreview | null> {
  const id = publicInviteIdFromToken(token);
  if (!id) return null;
  const now = new Date();
  const [row] = await getDb()
    .select({ invite: publicInvites, ownerName: users.name })
    .from(publicInvites)
    .innerJoin(users, eq(publicInvites.ownerUserId, users.id))
    .where(
      and(
        eq(publicInvites.id, id),
        eq(publicInvites.status, "active"),
        gt(publicInvites.expiresAt, now),
        lt(publicInvites.redemptionCount, publicInvites.maxRedemptions),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.invite.id,
    ownerUserId: row.invite.ownerUserId,
    ownerName: row.ownerName?.trim() || "A HoneyMatcha member",
    label: row.invite.label,
    expiresAt: row.invite.expiresAt.toISOString(),
    remainingRedemptions: Math.max(
      0,
      row.invite.maxRedemptions - row.invite.redemptionCount,
    ),
  };
}

export async function redeemPublicInvite(opts: {
  user: User;
  token: string;
}) {
  const publicInviteId = publicInviteIdFromToken(opts.token);
  if (!publicInviteId) {
    throw new AgentApiError(404, "Public invite not found or unavailable");
  }
  const db = getDb();
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(publicInvites)
      .where(
        and(
          eq(publicInvites.id, publicInviteId),
          eq(publicInvites.status, "active"),
          gt(publicInvites.expiresAt, now),
        ),
      )
      .limit(1);
    if (!invite) {
      throw new AgentApiError(410, "This public invite is no longer available");
    }
    if (invite.ownerUserId === opts.user.id) {
      throw new AgentApiError(400, "You cannot redeem your own public invite");
    }

    const [existing] = await tx
      .select()
      .from(links)
      .where(
        and(
          or(
            and(
              eq(links.fromUserId, invite.ownerUserId),
              eq(links.toUserId, opts.user.id),
            ),
            and(
              eq(links.fromUserId, opts.user.id),
              eq(links.toUserId, invite.ownerUserId),
            ),
          ),
          or(eq(links.status, "pending"), eq(links.status, "active")),
        ),
      )
      .limit(1);
    if (existing?.status === "active") {
      throw new AgentApiError(409, "You are already connected");
    }
    if (existing) {
      return { request: existing, idempotent: true };
    }

    const [claimed] = await tx
      .update(publicInvites)
      .set({
        redemptionCount: sql`${publicInvites.redemptionCount} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(publicInvites.id, invite.id),
          eq(publicInvites.status, "active"),
          gt(publicInvites.expiresAt, now),
          lt(publicInvites.redemptionCount, publicInvites.maxRedemptions),
        ),
      )
      .returning();
    if (!claimed) {
      throw new AgentApiError(409, "This public invite has reached its limit");
    }

    const [request] = await tx
      .insert(links)
      .values({
        fromUserId: invite.ownerUserId,
        toUserId: opts.user.id,
        toEmail: opts.user.email,
        toName: opts.user.name,
        inviteCode: generateInviteCode(),
        status: "pending",
        scopes: invite.scopes,
        publicInviteId: invite.id,
        confirmRequired: invite.confirmRequired,
        expiresAt: invite.expiresAt,
      })
      .returning();
    if (!request) {
      throw new AgentApiError(503, "Could not create connection request");
    }
    return { request, idempotent: false };
  });

  await writeAudit({
    actorUserId: opts.user.id,
    action: "public_invite.redeemed",
    entityType: "link",
    entityId: result.request.id,
    metadata: {
      publicInviteId,
      inviterUserId: result.request.fromUserId,
      idempotent: result.idempotent,
    },
  });
  return {
    ok: true,
    request: {
      id: result.request.id,
      status: result.request.status,
      inviterUserId: result.request.fromUserId,
    },
    idempotent: result.idempotent,
    message: "Connection request sent. The inviter must approve it.",
  };
}

export async function revokePublicInvite(opts: {
  owner: User;
  publicInviteId: string;
}): Promise<{ id: string; status: "revoked" }> {
  const now = new Date();
  const [revoked] = await getDb()
    .update(publicInvites)
    .set({ status: "revoked", revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(publicInvites.id, opts.publicInviteId),
        eq(publicInvites.ownerUserId, opts.owner.id),
        eq(publicInvites.status, "active"),
      ),
    )
    .returning();
  if (!revoked) {
    throw new AgentApiError(404, "Active public invite not found");
  }
  await writeAudit({
    actorUserId: opts.owner.id,
    action: "public_invite.revoked",
    entityType: "public_invite",
    entityId: revoked.id,
  });
  return { id: revoked.id, status: "revoked" };
}
