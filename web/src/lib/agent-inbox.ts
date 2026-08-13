import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { agentInbox, apiKeys, type User } from "@/db/schema";
import { AgentApiError } from "@/lib/agent-errors";
import { boundedText } from "@/lib/validation";

export type AgentReach =
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
  kind: string;
  summary: string;
  body: Record<string, unknown>;
  createdAt: string;
  acked: boolean;
};

function isSafeCallbackUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return process.env.NODE_ENV !== "production";
  }
  if (/^(10\.|192\.168\.|169\.254\.|0\.0\.0\.0)/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
  return true;
}

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
  if (url && !isSafeCallbackUrl(url)) {
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
}): Promise<AgentNotifyResult[]> {
  const results: AgentNotifyResult[] = [];
  for (const recipient of opts.recipients) {
    if (!recipient.userId) {
      results.push({
        userId: null,
        email: recipient.email,
        name: recipient.name,
        hasPairedAgent: false,
        inboxId: null,
        callback: "none",
        reach: "not_on_honeymatcha",
      });
      continue;
    }
    results.push(
      await deliverToUserAgent({
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
      }),
    );
  }
  return results;
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
    return {
      userId: opts.userId,
      email: opts.email,
      name: opts.name,
      hasPairedAgent: paired.hasPairedAgent,
      inboxId: existing.id,
      callback: "none",
      reach: paired.hasPairedAgent ? "delivered_to_agent" : "no_paired_agent",
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
    reach: paired.hasPairedAgent ? "delivered_to_agent" : "no_paired_agent",
  };
}

async function postAgentCallbacks(opts: {
  userId: string;
  inboxId: string;
  sessionId: string;
  kind: string;
  summary: string;
}): Promise<"delivered" | "failed" | "none"> {
  const db = getDb();
  const keys = await db
    .select({
      callbackUrl: apiKeys.callbackUrl,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, opts.userId), isNull(apiKeys.revokedAt)));
  const urls = [
    ...new Set(
      keys
        .map((key) => key.callbackUrl)
        .filter((url): url is string => Boolean(url && isSafeCallbackUrl(url))),
    ),
  ];
  if (urls.length === 0) return "none";

  const payload = JSON.stringify({
    source: "honeymatcha",
    type: "agent_inbox",
    inboxId: opts.inboxId,
    sessionId: opts.sessionId,
    kind: opts.kind,
    summary: opts.summary,
    instructions:
      "Call get_inbox, then read_board for this session. Do not book a Google Calendar event yourself.",
  });

  let delivered = false;
  let failed = false;
  await Promise.all(
    urls.map(async (url) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4_000);
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-honeymatcha-event": "agent_inbox",
          },
          body: payload,
          redirect: "error",
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
  return "Call get_inbox at the start of every turn. That is how HoneyMatcha reaches you when someone else's agent starts a task with your human.";
}
