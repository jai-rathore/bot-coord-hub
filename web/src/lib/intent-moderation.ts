import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  intentProposals,
  intentTypes,
  type IntentProposal,
  type User,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";

export function isIntentAdmin(user: User): boolean {
  const raw = process.env.INTENT_ADMIN_EMAILS ?? "";
  const admins = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (admins.length === 0) return false;
  return admins.includes(user.email.toLowerCase());
}

/**
 * Production fails closed: an unset admin list must not let any signed-in
 * user run the LLM triage worker. Locally the empty list still means
 * "any signed-in user", so a laptop without the env var can iterate.
 */
export function canRunIntentTriage(
  user: Pick<User, "email">,
  env: { production?: boolean; adminEmails?: string } = {},
): boolean {
  const raw = env.adminEmails ?? process.env.INTENT_ADMIN_EMAILS ?? "";
  const configured = Boolean(raw.trim());
  const production = env.production ?? process.env.NODE_ENV === "production";
  if (!configured) return !production;
  const admins = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(user.email.toLowerCase());
}

/** Publishing executable task types is restricted to configured admins. */
export function canModerateProposal(user: User, proposal: IntentProposal): boolean {
  void proposal;
  return isIntentAdmin(user);
}

export async function listPendingProposalsForModeration() {
  const db = getDb();
  return db
    .select()
    .from(intentProposals)
    .where(eq(intentProposals.status, "pending"))
    .orderBy(desc(intentProposals.createdAt));
}

export async function publishProposal(opts: {
  user: User;
  proposalId: string;
}): Promise<IntentProposal> {
  const db = getDb();
  const rows = await db
    .select()
    .from(intentProposals)
    .where(eq(intentProposals.id, opts.proposalId))
    .limit(1);
  const proposal = rows[0];
  if (!proposal) {
    throw Object.assign(new Error("Proposal not found"), { status: 404 });
  }
  if (!canModerateProposal(opts.user, proposal)) {
    throw Object.assign(new Error("Not allowed to publish this proposal"), {
      status: 403,
    });
  }
  if (proposal.status !== "pending") {
    throw Object.assign(new Error(`Proposal already ${proposal.status}`), {
      status: 409,
    });
  }

  const now = new Date();

  // Promote into canonical intent_types when missing.
  const existingType = await db
    .select()
    .from(intentTypes)
    .where(eq(intentTypes.slug, proposal.slug))
    .limit(1);
  if (existingType[0]) {
    if (existingType[0].status !== "live") {
      await db
        .update(intentTypes)
        .set({
          status: "live",
          name: proposal.name,
          description: proposal.description,
          updatedAt: now,
        })
        .where(eq(intentTypes.id, existingType[0].id));
    }
  } else {
    await db.insert(intentTypes).values({
      slug: proposal.slug,
      name: proposal.name,
      description: proposal.description,
      status: "live",
      schema: {},
    });
  }

  const [updated] = await db
    .update(intentProposals)
    .set({
      status: "live",
      rejectionReason: null,
      decidedByUserId: opts.user.id,
      decidedAt: now,
      updatedAt: now,
    })
    .where(and(eq(intentProposals.id, proposal.id), eq(intentProposals.status, "pending")))
    .returning();

  if (!updated) {
    throw Object.assign(new Error("Proposal already decided"), { status: 409 });
  }

  await writeAudit({
    actorUserId: opts.user.id,
    action: "intent.published",
    entityType: "intent_proposal",
    entityId: updated.id,
    metadata: { slug: updated.slug, name: updated.name },
  });

  return updated;
}

export async function rejectProposal(opts: {
  user: User;
  proposalId: string;
  reason: string;
}): Promise<IntentProposal> {
  const reason = opts.reason.trim();
  if (!reason) {
    throw Object.assign(new Error("rejection reason is required"), {
      status: 400,
    });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(intentProposals)
    .where(eq(intentProposals.id, opts.proposalId))
    .limit(1);
  const proposal = rows[0];
  if (!proposal) {
    throw Object.assign(new Error("Proposal not found"), { status: 404 });
  }
  if (!canModerateProposal(opts.user, proposal)) {
    throw Object.assign(new Error("Not allowed to reject this proposal"), {
      status: 403,
    });
  }
  if (proposal.status !== "pending") {
    throw Object.assign(new Error(`Proposal already ${proposal.status}`), {
      status: 409,
    });
  }

  const now = new Date();
  const [updated] = await db
    .update(intentProposals)
    .set({
      status: "rejected",
      rejectionReason: reason,
      decidedByUserId: opts.user.id,
      decidedAt: now,
      updatedAt: now,
    })
    .where(and(eq(intentProposals.id, proposal.id), eq(intentProposals.status, "pending")))
    .returning();

  if (!updated) {
    throw Object.assign(new Error("Proposal already decided"), { status: 409 });
  }

  await writeAudit({
    actorUserId: opts.user.id,
    action: "intent.rejected",
    entityType: "intent_proposal",
    entityId: updated.id,
    metadata: {
      slug: updated.slug,
      name: updated.name,
      rejectionReason: reason,
    },
  });

  return updated;
}
