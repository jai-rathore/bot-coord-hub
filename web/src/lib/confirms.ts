import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { confirms, sessions, type Confirm, type User } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { getSessionForUser, postSessionMessage } from "@/lib/sessions";

export type PublicConfirm = {
  id: string;
  sessionId: string;
  userId: string;
  action: string;
  note: string | null;
  metadata: Record<string, unknown>;
  status: Confirm["status"];
  decidedAt: string | null;
  createdAt: string;
  session: {
    id: string;
    intentType: string;
    status: string;
  } | null;
};

export async function listConfirmsForUser(
  user: User,
  status?: Confirm["status"],
): Promise<PublicConfirm[]> {
  const db = getDb();
  const rows = status
    ? await db
        .select({
          confirm: confirms,
          session: sessions,
        })
        .from(confirms)
        .leftJoin(sessions, eq(confirms.sessionId, sessions.id))
        .where(and(eq(confirms.userId, user.id), eq(confirms.status, status)))
        .orderBy(desc(confirms.createdAt))
    : await db
        .select({
          confirm: confirms,
          session: sessions,
        })
        .from(confirms)
        .leftJoin(sessions, eq(confirms.sessionId, sessions.id))
        .where(eq(confirms.userId, user.id))
        .orderBy(desc(confirms.createdAt));

  return rows.map(({ confirm, session }) => toPublicConfirm(confirm, session));
}

export async function requestConfirm(opts: {
  user: User;
  sessionId: string;
  action: string;
  note?: string | null;
  metadata?: Record<string, unknown>;
  /** Defaults to the authenticated user (human who must approve). */
  confirmUserId?: string;
}): Promise<PublicConfirm> {
  const action = opts.action.trim();
  if (!action) {
    throw Object.assign(new Error("action is required"), { status: 400 });
  }

  const session = await getSessionForUser(opts.sessionId, opts.user.id);
  const confirmUserId = opts.confirmUserId ?? opts.user.id;

  // Confirm target must be a session participant.
  if (
    confirmUserId !== session.initiatorUserId &&
    confirmUserId !== session.peerUserId
  ) {
    throw Object.assign(
      new Error("confirmUserId must be a session participant"),
      { status: 400 },
    );
  }

  const db = getDb();
  const [created] = await db
    .insert(confirms)
    .values({
      sessionId: session.id,
      userId: confirmUserId,
      action,
      note: opts.note?.trim() || null,
      metadata: opts.metadata ?? {},
      status: "pending",
    })
    .returning();

  await postSessionMessage({
    session,
    sender: opts.user,
    kind: "confirm.requested",
    body: {
      confirmId: created.id,
      action: created.action,
      note: created.note,
      text: `Confirmation requested: ${created.action}${
        created.note ? ` — ${created.note}` : ""
      }`,
    },
  });

  return toPublicConfirm(created, session);
}

export async function decideConfirm(opts: {
  user: User;
  confirmId: string;
  decision: "approved" | "denied";
  note?: string | null;
}): Promise<PublicConfirm> {
  const db = getDb();
  const rows = await db
    .select()
    .from(confirms)
    .where(eq(confirms.id, opts.confirmId))
    .limit(1);
  const confirm = rows[0];
  if (!confirm) {
    throw Object.assign(new Error("Confirm not found"), { status: 404 });
  }
  if (confirm.userId !== opts.user.id) {
    throw Object.assign(new Error("Not your confirmation to decide"), {
      status: 403,
    });
  }
  if (confirm.status !== "pending") {
    throw Object.assign(new Error(`Confirm already ${confirm.status}`), {
      status: 409,
    });
  }

  const now = new Date();
  const [updated] = await db
    .update(confirms)
    .set({
      status: opts.decision,
      decidedAt: now,
      note: opts.note?.trim() || confirm.note,
    })
    .where(eq(confirms.id, confirm.id))
    .returning();

  const session = await getSessionForUser(confirm.sessionId, opts.user.id);
  const kind =
    opts.decision === "approved" ? "confirm.approved" : "confirm.denied";
  const label = opts.decision === "approved" ? "Approved" : "Denied";

  await postSessionMessage({
    session,
    sender: opts.user,
    kind,
    body: {
      confirmId: updated.id,
      action: updated.action,
      note: updated.note,
      status: updated.status,
      text: `${label}: ${updated.action}${
        updated.note ? ` — ${updated.note}` : ""
      }`,
    },
  });

  if (opts.decision === "approved") {
    await db
      .update(sessions)
      .set({ status: "confirmed", updatedAt: now })
      .where(eq(sessions.id, session.id));
  } else {
    await db
      .update(sessions)
      .set({ status: "declined", updatedAt: now })
      .where(eq(sessions.id, session.id));
  }

  await writeAudit({
    actorUserId: opts.user.id,
    action:
      opts.decision === "approved" ? "confirm.approved" : "confirm.denied",
    entityType: "confirm",
    entityId: updated.id,
    metadata: {
      sessionId: updated.sessionId,
      action: updated.action,
      note: updated.note,
    },
  });

  return toPublicConfirm(updated, {
    ...session,
    status: opts.decision === "approved" ? "confirmed" : "declined",
  });
}

function toPublicConfirm(
  confirm: Confirm,
  session: {
    id: string;
    intentType: string;
    status: string;
  } | null,
): PublicConfirm {
  return {
    id: confirm.id,
    sessionId: confirm.sessionId,
    userId: confirm.userId,
    action: confirm.action,
    note: confirm.note,
    metadata: (confirm.metadata as Record<string, unknown>) ?? {},
    status: confirm.status,
    decidedAt: confirm.decidedAt?.toISOString() ?? null,
    createdAt: confirm.createdAt.toISOString(),
    session: session
      ? {
          id: session.id,
          intentType: session.intentType,
          status: session.status,
        }
      : null,
  };
}
