import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  confirms,
  sessionParticipants,
  sessions,
  type Confirm,
  type User,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { getSessionForUser, postSessionMessage } from "@/lib/sessions";
import { tryBookAfterConfirmApprovals } from "@/lib/schedule-meeting";
import { enqueueSageActivityTrigger } from "@/lib/sage/triggers";

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

async function isParticipant(sessionId: string, userId: string) {
  const db = getDb();
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session) return false;
  if (session.initiatorUserId === userId || session.peerUserId === userId) {
    return true;
  }
  const [part] = await db
    .select()
    .from(sessionParticipants)
    .where(
      and(
        eq(sessionParticipants.sessionId, sessionId),
        eq(sessionParticipants.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(part);
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

  if (!(await isParticipant(session.id, confirmUserId))) {
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
        created.note ? `: ${created.note}` : ""
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
  actorApiKeyId?: string | null;
  actorKind?: "user" | "agent";
}): Promise<PublicConfirm & { calendar?: Record<string, unknown> }> {
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
    .where(and(eq(confirms.id, confirm.id), eq(confirms.status, "pending")))
    .returning();
  if (!updated) {
    throw Object.assign(new Error("Confirmation was already decided"), {
      status: 409,
    });
  }

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
        updated.note ? `: ${updated.note}` : ""
      }`,
    },
    actorApiKeyId: opts.actorApiKeyId ?? null,
    actorKind: opts.actorKind ?? "user",
  });

  await db
    .update(sessionParticipants)
    .set({
      voteStatus: opts.decision === "approved" ? "accepted" : "declined",
    })
    .where(
      and(
        eq(sessionParticipants.sessionId, session.id),
        eq(sessionParticipants.userId, opts.user.id),
      ),
    );

  let calendar: Record<string, unknown> | undefined;

  await writeAudit({
    actorUserId: opts.user.id,
    actorApiKeyId: opts.actorApiKeyId ?? null,
    actorKind: opts.actorKind ?? "user",
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

  if (opts.decision === "denied") {
    await db
      .update(sessions)
      .set({ status: "declined", updatedAt: now })
      .where(eq(sessions.id, session.id));
    await enqueueSageActivityTrigger({
      userId: opts.user.id,
      sourceId: `${updated.id}:${updated.status}:actor`,
      trigger: "approval_result",
      sessionId: session.id,
    });
    return {
      ...toPublicConfirm(updated, { ...session, status: "declined" }),
      calendar: { status: "cancelled", message: "Meeting declined." },
    };
  }

  // approved: events book straight away; the organizer is the only approver.
  if (updated.action === "event.confirm") {
    const { bookEventForConfirm } = await import("@/lib/events/book");
    const booking = await bookEventForConfirm(
      (updated.metadata as Record<string, unknown>) ?? {},
    );
    await db
      .update(sessions)
      .set({ status: "confirmed", updatedAt: now })
      .where(eq(sessions.id, session.id));
    await enqueueSageActivityTrigger({
      userId: opts.user.id,
      sourceId: `${updated.id}:${updated.status}:actor`,
      trigger: "approval_result",
      eventId:
        typeof updated.metadata?.eventId === "string"
          ? updated.metadata.eventId
          : null,
      sessionId: session.id,
    });
    return {
      ...toPublicConfirm(updated, { ...session, status: "confirmed" }),
      calendar: (booking as unknown as Record<string, unknown>) ?? {
        status: "unavailable",
      },
    };
  }

  // approved: for schedule_meeting wait for all; otherwise confirm immediately
  if (session.intentType === "schedule_meeting") {
    const booking = await tryBookAfterConfirmApprovals(
      opts.user,
      session.id,
      {
        apiKeyId: opts.actorApiKeyId ?? null,
        kind: opts.actorKind ?? "user",
      },
    );
    calendar = (booking?.calendar as Record<string, unknown>) ?? {
      status: "awaiting_peer_confirms",
    };
    const [fresh] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, session.id))
      .limit(1);
    await enqueueSageActivityTrigger({
      userId: opts.user.id,
      sourceId: `${updated.id}:${updated.status}:actor`,
      trigger: "approval_result",
      sessionId: session.id,
    });
    return {
      ...toPublicConfirm(updated, fresh ?? session),
      calendar,
    };
  }

  await db
    .update(sessions)
    .set({ status: "confirmed", updatedAt: now })
    .where(eq(sessions.id, session.id));

  await enqueueSageActivityTrigger({
    userId: opts.user.id,
    sourceId: `${updated.id}:${updated.status}:actor`,
    trigger: "approval_result",
    sessionId: session.id,
  });

  return toPublicConfirm(updated, {
    ...session,
    status: "confirmed",
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
