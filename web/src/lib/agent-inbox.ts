import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { agentInbox, apiKeys, type User } from "@/db/schema";
import { AgentApiError } from "@/lib/agent-errors";
import {
  STANDING_CHECK_INTERVAL_MINUTES,
  standingCheckInstruction,
  standingCheckPrompt,
} from "@/lib/agent-clients";
import { appOrigin } from "@/lib/connect-copy";
import {
  fetchResolvedCallback,
  isSafeCallbackUrl,
  resolveSafeCallbackUrl,
} from "@/lib/safe-url";
import { boundedText } from "@/lib/validation";
import { getAgentOperatorMode } from "@/lib/sage/job-store";
import { enqueueSageActivityTrigger } from "@/lib/sage/triggers";

export type AgentReach =
  | "delivered_to_sage"
  | "delivered_to_agent"
  | "no_paired_agent"
  | "not_on_honeymatcha";

export type AgentNotifyResult = {
  userId: string | null;
  email: string;
  name: string | null;
  hasPairedAgent: boolean;
  inboxId: string | null;
  callback: "delivered" | "failed" | "none";
  reach: AgentReach;
};

export type InboxItem = {
  id: string;
  sessionId: string | null;
  /** Set on event items; pass straight to get_event_board / respond_to_event. */
  eventId: string | null;
  kind: string;
  summary: string;
  body: Record<string, unknown>;
  createdAt: string;
  acked: boolean;
};

export async function userHasPairedAgent(userId: string): Promise<{
  hasPairedAgent: boolean;
  agentName: string | null;
}> {
  const db = getDb();
  const [key] = await db
    .select({
      name: apiKeys.name,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.lastUsedAt), desc(apiKeys.createdAt))
    .limit(1);
  return {
    hasPairedAgent: Boolean(key),
    agentName: key?.name ?? null,
  };
}

export async function countPendingInbox(userId: string): Promise<number> {
  const rows = await listInboxForUser(userId, { pendingOnly: true, limit: 50 });
  return rows.length;
}

export async function listInboxForUser(
  userId: string,
  opts: { pendingOnly?: boolean; limit?: number } = {},
): Promise<InboxItem[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(agentInbox)
    .where(
      opts.pendingOnly
        ? and(eq(agentInbox.userId, userId), isNull(agentInbox.ackedAt))
        : eq(agentInbox.userId, userId),
    )
    .orderBy(desc(agentInbox.createdAt))
    .limit(Math.min(Math.max(opts.limit ?? 20, 1), 50));

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    eventId: row.eventId,
    kind: row.kind,
    summary: row.summary,
    body: (row.body as Record<string, unknown>) ?? {},
    createdAt: row.createdAt.toISOString(),
    acked: Boolean(row.ackedAt),
  }));
}

export async function ackInboxItem(opts: {
  user: User;
  inboxId: string;
}): Promise<InboxItem> {
  const db = getDb();
  const [updated] = await db
    .update(agentInbox)
    .set({ ackedAt: new Date() })
    .where(
      and(eq(agentInbox.id, opts.inboxId), eq(agentInbox.userId, opts.user.id)),
    )
    .returning();
  if (!updated) {
    throw new AgentApiError(404, "Inbox item not found");
  }
  return {
    id: updated.id,
    sessionId: updated.sessionId,
    eventId: updated.eventId,
    kind: updated.kind,
    summary: updated.summary,
    body: (updated.body as Record<string, unknown>) ?? {},
    createdAt: updated.createdAt.toISOString(),
    acked: true,
  };
}

export async function registerAgentCallback(opts: {
  apiKeyId: string;
  callbackUrl: string | null;
}): Promise<{ callbackUrl: string | null }> {
  const url: string | null =
    opts.callbackUrl === null
      ? null
      : (boundedText(opts.callbackUrl, "callbackUrl", 500) ?? null);
  if (url && !(await isSafeCallbackUrl(url))) {
    throw new AgentApiError(
      400,
      "callbackUrl must be a public http(s) URL",
    );
  }
  const db = getDb();
  await db
    .update(apiKeys)
    .set({ callbackUrl: url })
    .where(eq(apiKeys.id, opts.apiKeyId));
  return { callbackUrl: url };
}

/** schedule_meeting reuses schedule.requested so an unacked schedule notify is not doubled. */
export function inboxKindForSessionActivity(intentType: string): string {
  return intentType === "schedule_meeting"
    ? "schedule.requested"
    : "session.activity";
}

export function peerUserIdsExcludingActor(opts: {
  actorUserId: string;
  initiatorUserId: string;
  peerUserId: string | null;
  participantUserIds?: string[];
}): string[] {
  const ids = new Set<string>();
  if (opts.initiatorUserId !== opts.actorUserId) {
    ids.add(opts.initiatorUserId);
  }
  if (opts.peerUserId && opts.peerUserId !== opts.actorUserId) {
    ids.add(opts.peerUserId);
  }
  for (const id of opts.participantUserIds ?? []) {
    if (id !== opts.actorUserId) ids.add(id);
  }
  return [...ids];
}

export async function notifyPeerAgents(opts: {
  recipients: Array<{
    userId: string | null;
    email: string;
    name: string | null;
  }>;
  sessionId: string;
  kind: string;
  summary: string;
  body?: Record<string, unknown>;
  /** Reuse an existing unacked inbox row and skip the callback. */
  skipIfUnacked?: boolean;
  trigger?: "inbox" | "approval_result";
}): Promise<AgentNotifyResult[]> {
  // Concurrent rather than serial: each delivery is several queries plus an
  // outbound callback with its own timeout, and recipients are independent.
  // Promise.all preserves the input order, so the result shape is unchanged.
  return Promise.all(
    opts.recipients.map(async (recipient): Promise<AgentNotifyResult> => {
      if (!recipient.userId) {
        return {
          userId: null,
          email: recipient.email,
          name: recipient.name,
          hasPairedAgent: false,
          inboxId: null,
          callback: "none",
          reach: "not_on_honeymatcha",
        };
      }
      return deliverToUserAgent({
        userId: recipient.userId,
        email: recipient.email,
        name: recipient.name,
        sessionId: opts.sessionId,
        kind: opts.kind,
        summary: opts.summary,
        body: {
          ...(opts.body ?? {}),
          fromEmail: opts.body?.fromEmail,
          sessionId: opts.sessionId,
        },
        skipIfUnacked: opts.skipIfUnacked,
        trigger: opts.trigger,
      });
    }),
  );
}

export async function deliverDiscoveryInbox(opts: {
  userId: string;
  kind: string;
  summary: string;
  body: Record<string, unknown>;
  sessionId?: string | null;
  discoveryInterestId?: string | null;
  dedupeKey?: string | null;
}): Promise<{ inboxId: string | null; callback: "delivered" | "failed" | "none" }> {
  const [created] = await getDb()
    .insert(agentInbox)
    .values({
      userId: opts.userId,
      sessionId: opts.sessionId ?? null,
      discoveryInterestId: opts.discoveryInterestId ?? null,
      kind: opts.kind,
      summary: opts.summary,
      body: opts.body,
      dedupeKey: opts.dedupeKey ?? null,
    })
    .onConflictDoNothing({ target: agentInbox.dedupeKey })
    .returning();
  if (!created) return { inboxId: null, callback: "none" };
  await enqueueSageActivityTrigger({
    userId: opts.userId,
    sourceId: created.id,
    trigger: "inbox",
    sessionId: opts.sessionId,
  });
  const callback = await postAgentCallbacks({
    userId: opts.userId,
    inboxId: created.id,
    sessionId: opts.sessionId ?? null,
    kind: opts.kind,
    summary: opts.summary,
  });
  return { inboxId: created.id, callback };
}

/** Deliver an expectation-alignment handoff to a candidate or recruiter agent. */
export async function deliverHiringInbox(opts: {
  userId: string;
  kind: string;
  summary: string;
  body: Record<string, unknown>;
  dedupeKey: string;
}): Promise<{ inboxId: string | null; callback: "delivered" | "failed" | "none" }> {
  const [created] = await getDb()
    .insert(agentInbox)
    .values({
      userId: opts.userId,
      kind: opts.kind,
      summary: opts.summary,
      body: opts.body,
      dedupeKey: opts.dedupeKey,
    })
    .onConflictDoNothing({ target: agentInbox.dedupeKey })
    .returning();
  if (!created) return { inboxId: null, callback: "none" };

  await enqueueSageActivityTrigger({
    userId: opts.userId,
    sourceId: created.id,
    trigger: "inbox",
  });
  const callback = await postAgentCallbacks({
    userId: opts.userId,
    inboxId: created.id,
    sessionId: null,
    kind: opts.kind,
    summary: opts.summary,
  });
  return { inboxId: created.id, callback };
}

/**
 * Deliver one event notification to a human's agent.
 *
 * Events reach people by email through notification_outbox; this is the same
 * fan-out for the agent side, so an agent learns about an invitation, a closing
 * deadline, or a confirmed time by calling get_inbox: the contract the MCP
 * initialize instructions promise.
 *
 * `dedupeKey` is the outbox's key, so a retried tick can never deliver twice.
 * A row that already exists is a no-op and reports callback "none".
 */
export async function deliverEventInbox(opts: {
  userId: string;
  eventId: string;
  kind: string;
  summary: string;
  body: Record<string, unknown>;
  dedupeKey: string;
}): Promise<{ inboxId: string | null; callback: "delivered" | "failed" | "none" }> {
  const [created] = await getDb()
    .insert(agentInbox)
    .values({
      userId: opts.userId,
      eventId: opts.eventId,
      kind: opts.kind,
      summary: opts.summary,
      body: opts.body,
      dedupeKey: opts.dedupeKey,
    })
    .onConflictDoNothing({ target: agentInbox.dedupeKey })
    .returning();
  if (!created) return { inboxId: null, callback: "none" };

  await enqueueSageActivityTrigger({
    userId: opts.userId,
    sourceId: created.id,
    trigger: opts.kind === "event.deadline_soon" ? "deadline" : "inbox",
    eventId: opts.eventId,
  });

  const callback = await postAgentCallbacks({
    userId: opts.userId,
    inboxId: created.id,
    sessionId: null,
    eventId: opts.eventId,
    kind: opts.kind,
    summary: opts.summary,
  });
  return { inboxId: created.id, callback };
}

export async function postDiscoveryInboxCallback(
  inboxId: string,
  trigger: "inbox" | "approval_result" = "inbox",
): Promise<"delivered" | "failed" | "none"> {
  const [item] = await getDb()
    .select()
    .from(agentInbox)
    .where(and(eq(agentInbox.id, inboxId), isNull(agentInbox.ackedAt)))
    .limit(1);
  if (!item) return "none";
  await enqueueSageActivityTrigger({
    userId: item.userId,
    sourceId: item.id,
    trigger,
    sessionId: item.sessionId,
    eventId: item.eventId,
  });
  return postAgentCallbacks({
    userId: item.userId,
    inboxId: item.id,
    sessionId: item.sessionId,
    kind: item.kind,
    summary: item.summary,
  });
}

async function deliverToUserAgent(opts: {
  userId: string;
  email: string;
  name: string | null;
  sessionId: string;
  kind: string;
  summary: string;
  body: Record<string, unknown>;
  skipIfUnacked?: boolean;
  trigger?: "inbox" | "approval_result";
}): Promise<AgentNotifyResult> {
  const db = getDb();
  const paired = await userHasPairedAgent(opts.userId);

  const [existing] = await db
    .select()
    .from(agentInbox)
    .where(
      and(
        eq(agentInbox.userId, opts.userId),
        eq(agentInbox.sessionId, opts.sessionId),
        eq(agentInbox.kind, opts.kind),
        isNull(agentInbox.ackedAt),
      ),
    )
    .limit(1);

  if (existing && opts.skipIfUnacked) {
    const route = await enqueueSageActivityTrigger({
      userId: opts.userId,
      sourceId: existing.id,
      trigger: opts.trigger ?? "inbox",
      sessionId: opts.sessionId,
    });
    return {
      userId: opts.userId,
      email: opts.email,
      name: opts.name,
      hasPairedAgent: paired.hasPairedAgent,
      inboxId: existing.id,
      callback: "none",
      reach:
        route === "sage"
          ? "delivered_to_sage"
          : paired.hasPairedAgent
            ? "delivered_to_agent"
            : "no_paired_agent",
    };
  }

  let inboxId = existing?.id ?? null;
  if (!inboxId) {
    const [created] = await db
      .insert(agentInbox)
      .values({
        userId: opts.userId,
        sessionId: opts.sessionId,
        kind: opts.kind,
        summary: opts.summary,
        body: opts.body,
      })
      .returning();
    inboxId = created.id;
  }

  const route = await enqueueSageActivityTrigger({
    userId: opts.userId,
    sourceId: inboxId,
    trigger: opts.trigger ?? "inbox",
    sessionId: opts.sessionId,
  });

  const callback = await postAgentCallbacks({
    userId: opts.userId,
    inboxId,
    sessionId: opts.sessionId,
    kind: opts.kind,
    summary: opts.summary,
  });

  return {
    userId: opts.userId,
    email: opts.email,
    name: opts.name,
    hasPairedAgent: paired.hasPairedAgent,
    inboxId,
    callback,
    reach:
      route === "sage"
        ? "delivered_to_sage"
        : paired.hasPairedAgent
          ? "delivered_to_agent"
          : "no_paired_agent",
  };
}

async function postAgentCallbacks(opts: {
  userId: string;
  inboxId: string;
  sessionId: string | null;
  eventId?: string | null;
  kind: string;
  summary: string;
}): Promise<"delivered" | "failed" | "none"> {
  const db = getDb();
  const operatorMode = await getAgentOperatorMode(opts.userId);
  if (operatorMode !== "external_primary") return "none";
  const keys = await db
    .select({
      callbackUrl: apiKeys.callbackUrl,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, opts.userId), isNull(apiKeys.revokedAt)));
  const candidates = [
    ...new Set(
      keys
        .map((key) => key.callbackUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  ];
  const targets = (
    await Promise.all(
      candidates.map((url) => resolveSafeCallbackUrl(url)),
    )
  ).filter((row): row is NonNullable<typeof row> => row !== null);
  if (targets.length === 0) return "none";

  const payload = JSON.stringify({
    source: "honeymatcha",
    type: "agent_inbox",
    inboxId: opts.inboxId,
    sessionId: opts.sessionId,
    eventId: opts.eventId ?? null,
    kind: opts.kind,
    summary: opts.summary,
    instructions: opts.kind.startsWith("hiring.")
      ? "Call get_inbox, follow the hiring item's instructions, and involve your human before sharing expectations or agreeing to an introduction."
      : opts.eventId
      ? "Call get_inbox, then get_event_board for this eventId. Answer with respond_to_event once your human has told you what works. Do not lock, cancel, or book anything yourself."
      : "Call get_inbox, then read_board for this session. Do not book a Google Calendar event yourself.",
  });

  let delivered = false;
  let failed = false;
  await Promise.all(
    targets.map(async (target) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4_000);
        const response = await fetchResolvedCallback(target, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-honeymatcha-event": "agent_inbox",
          },
          body: payload,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (response.ok) delivered = true;
        else failed = true;
      } catch {
        failed = true;
      }
    }),
  );
  if (delivered) return "delivered";
  if (failed) return "failed";
  return "none";
}

export function inboxInstructions(pending: number): string {
  if (pending > 0) {
    return `You have ${pending} unread HoneyMatcha inbox item(s) from another person's agent. Call get_inbox immediately and handle that work. Do not book Google yourself.`;
  }
  return `Call get_inbox at the start of every turn. That is how HoneyMatcha reaches you when someone else's agent starts a task with your human. ${standingCheckInstruction()}`;
}

/**
 * What this agent should do so inbound work does not wait for its human.
 *
 * HoneyMatcha has no way to interrupt a hosted assistant: there is no open MCP
 * stream to push down, and Claude, ChatGPT, Gemini and Grok cannot receive an
 * inbound webhook. So the answer is a standing check the agent schedules for
 * itself. This ships in whoami and get_inbox rather than only in the connect
 * docs, because the agent: not the human: is the one that can create it.
 */
export function standingCheckStatus(opts: {
  callbackRegistered: boolean;
}): {
  /** True once something else already delivers: no schedule needed. */
  satisfied: boolean;
  intervalMinutes: number;
  instructions: string;
  /** Paste-ready text for a scheduler that only stores a prompt string. */
  prompt: string;
  setupUrl: string;
} {
  const origin = appOrigin();
  return {
    satisfied: opts.callbackRegistered,
    intervalMinutes: STANDING_CHECK_INTERVAL_MINUTES,
    instructions: opts.callbackRegistered
      ? "A callback URL is registered, so HoneyMatcha pushes new work to you. A scheduled get_inbox is still a cheap safety net if your callback host can go down."
      : standingCheckInstruction(),
    prompt: standingCheckPrompt(origin),
    setupUrl: `${origin}/docs#standing-check`,
  };
}
