/**
 * Shared agent API business logic (Bearer-auth callers).
 * Used by /api/v1/* routes and the MCP tool dispatcher.
 *
 * Domain mutations for links/sessions/confirms live in dedicated libs so the
 * Clerk UI and Bearer/MCP paths share one coherent implementation.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  confirms,
  intentProposals,
  type Confirm,
} from "@/db/schema";
import {
  findDedupeHits,
  isExactDedupeConflict,
  listRegistryIntents,
} from "@/lib/intents";
import { normalizeIntentName, slugify } from "@/lib/slug";
import type { AgentAuth } from "@/lib/agent-auth";
import {
  acceptInviteLink,
  createInviteLink,
  listLinksForUser,
  revokeLinkForUser,
  updateLinkPolicyForUser,
} from "@/lib/links";
import { runScheduleMeeting } from "@/lib/schedule-meeting";
import type { AllowedHours } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { assertAgentScope, hasAgentScope } from "@/lib/scopes";
import { boundedText } from "@/lib/validation";
import {
  ackInboxItem,
  countPendingInbox,
  inboxInstructions,
  listInboxForUser,
  registerAgentCallback,
} from "@/lib/agent-inbox";
import {
  createSessionForUser,
  getSessionForUser,
  listMessagesForSession,
  listSessionsForUser,
  messageToPlainEnglish,
  postSessionMessage,
  isDiscoveryMediatedSession,
} from "@/lib/sessions";
import {
  decideConfirm,
  listConfirmsForUser,
  requestConfirm as requestConfirmForUser,
} from "@/lib/confirms";
import {
  createGuestTask as createScopedGuestTask,
  getGuestTaskForOrganizer,
  listGuestTasksForOrganizer,
  revokeGuestTask as revokeScopedGuestTask,
} from "@/lib/guest-tasks";
import {
  createPublicInvite as createShareablePublicInvite,
  listPublicInvites as listShareablePublicInvites,
  redeemPublicInvite as redeemShareablePublicInvite,
  revokePublicInvite as revokeShareablePublicInvite,
} from "@/lib/public-invites";
import {
  getAgentCapabilityManifest,
  listDiscoveryCatalog,
  listDiscoveryInterests,
  requestDiscoveryIntroduction,
  searchDiscovery,
  submitDiscoveryEnrollment,
  upsertAgentCapabilityManifest,
  type CoarseLocationInput,
} from "@/lib/discovery-service";
import { distributedRateLimit } from "@/lib/distributed-rate-limit";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";

import { AgentApiError } from "@/lib/agent-errors";
export { AgentApiError } from "@/lib/agent-errors";

async function assertDiscoveryRate(
  auth: AgentAuth,
  action: string,
  limit: number,
) {
  let result: Awaited<ReturnType<typeof distributedRateLimit>>;
  try {
    result = await distributedRateLimit(
      `${action}:${auth.user.id}`,
      limit,
    );
  } catch {
    throw new AgentApiError(
      503,
      "Discovery is temporarily unavailable",
      { code: "rate_limiter_unavailable", retryAfterSec: 5 },
    );
  }
  if (!result.ok) {
    throw new AgentApiError(429, "Discovery rate limit exceeded", {
      code: "rate_limited",
      retryAfterSec: result.retryAfterSec,
    });
  }
  let daily: Awaited<ReturnType<typeof distributedRateLimit>>;
  try {
    daily = await distributedRateLimit(
      `${action}:daily:${auth.user.id}`,
      limit * 20,
      24 * 60 * 60 * 1000,
    );
  } catch {
    throw new AgentApiError(
      503,
      "Discovery is temporarily unavailable",
      { code: "rate_limiter_unavailable", retryAfterSec: 5 },
    );
  }
  if (!daily.ok) {
    throw new AgentApiError(429, "Daily discovery privacy budget exceeded", {
      code: "privacy_budget_exceeded",
      retryAfterSec: daily.retryAfterSec,
    });
  }
}

function assertDiscoveryEnabled() {
  if (!discoveryFeatureEnabled()) {
    throw new AgentApiError(503, "Discovery is temporarily unavailable", {
      code: "discovery_disabled",
    });
  }
}

function rethrowAsAgentError(err: unknown): never {
  if (err instanceof AgentApiError) throw err;
  const message = err instanceof Error ? err.message : "Request failed";
  const status =
    err &&
    typeof err === "object" &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : message.includes("DATABASE_URL")
        ? 503
        : 500;
  if (status >= 500) {
    console.error("[agent-api] unexpected domain error", err);
  }
  throw new AgentApiError(
    status,
    status >= 500 ? "Internal server error" : message,
  );
}

export async function whoami(auth: AgentAuth) {
  let inbox: Awaited<ReturnType<typeof listInboxForUser>> = [];
  try {
    inbox = await listInboxForUser(auth.user.id, {
      pendingOnly: true,
      limit: 5,
    });
  } catch {
    inbox = [];
  }
  const pendingInbox = inbox.length;
  const capabilityManifest = await getAgentCapabilityManifest(auth.apiKey.id);
  return {
    ok: true,
    user: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
    },
    apiKey: {
      id: auth.apiKey.id,
      name: auth.apiKey.name,
      keyPrefix: auth.apiKey.keyPrefix,
      scopes: auth.apiKey.scopes,
      expiresAt: auth.apiKey.expiresAt,
      lastUsedAt: auth.apiKey.lastUsedAt,
      capabilityManifest,
    },
    inbox: {
      pending: pendingInbox,
      next: inbox[0] ?? null,
    },
    instructions: inboxInstructions(pendingInbox),
  };
}

export async function listLinks(auth: AgentAuth, baseUrl?: string) {
  assertAgentScope(auth, "people:read");
  try {
    const rows = await listLinksForUser(auth.user, baseUrl ?? "");
    return { ok: true, links: rows };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function createInvite(
  auth: AgentAuth,
  body: {
    toEmail?: string;
    toName?: string;
    scopes?: string[];
    confirmRequired?: boolean;
    timezone?: string | null;
    allowedHours?: AllowedHours | null;
    expiresInHours?: number;
  },
  baseUrl?: string,
) {
  assertAgentScope(auth, "people:write");
  try {
    const link = await createInviteLink({
      fromUser: auth.user,
      toEmail: body.toEmail,
      toName: body.toName,
      scopes: body.scopes,
      confirmRequired: body.confirmRequired,
      timezone: body.timezone,
      allowedHours: body.allowedHours,
      expiresInHours: body.expiresInHours,
      origin: baseUrl ?? "",
    });
    await writeAudit({
      actorUserId: auth.user.id,
      actorApiKeyId: auth.apiKey.id,
      actorKind: "agent",
      action: "link.invite",
      entityType: "link",
      entityId: link.id,
      metadata: { toEmail: body.toEmail ?? null },
    });
    return {
      ok: true,
      link,
      message:
        "Share this private, expiring invitation with the addressed person.",
    };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function listPublicInvites(
  auth: AgentAuth,
  baseUrl = "",
) {
  assertAgentScope(auth, "people:read");
  try {
    return {
      publicInvites: await listShareablePublicInvites(auth.user, baseUrl),
    };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function createPublicInvite(
  auth: AgentAuth,
  body: {
    label?: unknown;
    scopes?: unknown;
    confirmRequired?: boolean;
    expiresInHours?: unknown;
    maxRedemptions?: unknown;
  },
  baseUrl = "",
) {
  assertAgentScope(auth, "people:write");
  try {
    return {
      ok: true,
      publicInvite: await createShareablePublicInvite({
        owner: auth.user,
        label: body.label,
        scopes: body.scopes,
        confirmRequired: body.confirmRequired,
        expiresInHours: body.expiresInHours,
        maxRedemptions: body.maxRedemptions,
        origin: baseUrl,
      }),
      message:
        "Share the URL or QR with people. Every redemption still requires the human owner's approval.",
    };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function redeemPublicInvite(
  auth: AgentAuth,
  body: { token?: string },
) {
  assertAgentScope(auth, "people:write");
  try {
    return await redeemShareablePublicInvite({
      user: auth.user,
      token: body.token ?? "",
    });
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function revokePublicInvite(
  auth: AgentAuth,
  publicInviteId: string,
) {
  assertAgentScope(auth, "people:write");
  try {
    return {
      ok: true,
      ...(await revokeShareablePublicInvite({
        owner: auth.user,
        publicInviteId,
      })),
    };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function patchLinkPolicy(
  auth: AgentAuth,
  linkId: string,
  body: {
    confirmRequired?: boolean;
    timezone?: string | null;
    allowedHours?: AllowedHours | null;
  },
  baseUrl?: string,
) {
  assertAgentScope(auth, "people:write");
  try {
    const link = await updateLinkPolicyForUser({
      user: auth.user,
      linkId,
      confirmRequired: body.confirmRequired,
      timezone: body.timezone,
      allowedHours: body.allowedHours,
      origin: baseUrl ?? "",
    });
    await writeAudit({
      actorUserId: auth.user.id,
      actorApiKeyId: auth.apiKey.id,
      actorKind: "agent",
      action: "link.policy_update",
      entityType: "link",
      entityId: linkId,
      metadata: body as Record<string, unknown>,
    });
    return { ok: true, link };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function acceptInvite(
  auth: AgentAuth,
  body: { inviteCode?: string },
  baseUrl?: string,
) {
  assertAgentScope(auth, "people:write");
  try {
    const result = await acceptInviteLink({
      user: auth.user,
      inviteCode: body.inviteCode ?? "",
      origin: baseUrl ?? "",
    });
    return {
      ok: true,
      link: result.link,
      pair: result.pair,
    };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function revokeLink(auth: AgentAuth, linkId: string) {
  assertAgentScope(auth, "people:write");
  try {
    const result = await revokeLinkForUser({ user: auth.user, linkId });
    return { ok: true, ...result };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function listSessions(auth: AgentAuth) {
  assertAgentScope(auth, "tasks:read");
  try {
    const rows = await listSessionsForUser(auth.user);
    const pendingInbox = await countPendingInbox(auth.user.id);
    return {
      ok: true,
      sessions: rows,
      inbox: {
        pending: pendingInbox,
        instructions: inboxInstructions(pendingInbox),
      },
    };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function listInbox(auth: AgentAuth) {
  assertAgentScope(auth, "tasks:read");
  const items = await listInboxForUser(auth.user.id, { pendingOnly: true });
  return {
    ok: true,
    inbox: items,
    pending: items.length,
    instructions: inboxInstructions(items.length),
    next_steps:
      items.length > 0
        ? [
            "Handle each inbox item.",
            "Call read_board with sessionId.",
            "Ack the item when you have taken the next step.",
            "Do not book Google yourself.",
          ]
        : ["No inbound work right now. Call get_inbox at the start of every turn."],
  };
}

export async function ackInbox(auth: AgentAuth, inboxId: string) {
  assertAgentScope(auth, "tasks:write");
  return { ok: true, item: await ackInboxItem({ user: auth.user, inboxId }) };
}

export async function setAgentCallback(auth: AgentAuth, callbackUrl?: string | null) {
  assertAgentScope(auth, "profile:read");
  return {
    ok: true,
    ...(await registerAgentCallback({
      apiKeyId: auth.apiKey.id,
      callbackUrl: callbackUrl ?? null,
    })),
  };
}

export async function listGuestTasks(auth: AgentAuth) {
  assertAgentScope(auth, "guest_tasks:read");
  return {
    ok: true,
    tasks: await listGuestTasksForOrganizer(auth.user),
  };
}

export async function createGuestTask(
  auth: AgentAuth,
  body: {
    taskType?: string;
    title?: string;
    description?: string;
    config?: Record<string, unknown>;
    privateConfig?: Record<string, unknown>;
    targetEmail?: string;
    expiresInMinutes?: number;
    maxResponses?: number;
    sessionId?: string;
  },
  baseUrl?: string,
) {
  assertAgentScope(auth, "guest_tasks:write");
  return {
    ok: true,
    ...(await createScopedGuestTask({
      organizer: auth.user,
      taskType: body.taskType,
      title: body.title,
      description: body.description,
      config: body.config,
      privateConfig: body.privateConfig,
      targetEmail: body.targetEmail,
      expiresInMinutes: body.expiresInMinutes,
      maxResponses: body.maxResponses,
      sessionId: body.sessionId,
      origin: baseUrl ?? "",
      actor: { kind: "agent", apiKeyId: auth.apiKey.id },
    })),
  };
}

export async function readGuestTask(
  auth: AgentAuth,
  publicId: string,
) {
  assertAgentScope(auth, "guest_tasks:read");
  return {
    ok: true,
    ...(await getGuestTaskForOrganizer(auth.user, publicId)),
  };
}

export async function revokeGuestTask(
  auth: AgentAuth,
  publicId: string,
) {
  assertAgentScope(auth, "guest_tasks:write");
  return {
    ok: true,
    task: await revokeScopedGuestTask(auth.user, publicId, {
      kind: "agent",
      apiKeyId: auth.apiKey.id,
    }),
  };
}

export async function createSession(
  auth: AgentAuth,
  body: {
    intentType?: string;
    peerUserId?: string;
    linkId?: string;
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
  },
) {
  assertAgentScope(auth, "tasks:write");
  try {
    if (!body.intentType?.trim()) {
      throw new AgentApiError(400, "intentType is required");
    }
    const session = await createSessionForUser({
      user: auth.user,
      intentType: body.intentType,
      peerUserId: body.peerUserId,
      linkId: body.linkId,
      payload: body.payload,
      idempotencyKey: body.idempotencyKey,
    });
    return { ok: true, session, scheduled: false, booked: false };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function readBoard(auth: AgentAuth, sessionId: string) {
  assertAgentScope(auth, "tasks:read");
  try {
    const session = await getSessionForUser(sessionId, auth.user.id);
    const messages = await listMessagesForSession(sessionId, auth.user.id);
    const discoveryPrivate = isDiscoveryMediatedSession(session);
    return {
      ok: true,
      session: {
        id: session.id,
        intentType: session.intentType,
        status: session.status,
        payload: discoveryPrivate
          ? {
              privacyMode: "discovery",
              disclosureStage: "mutual_interest",
            }
          : session.payload,
        initiatorUserId: discoveryPrivate ? null : session.initiatorUserId,
        peerUserId: discoveryPrivate ? null : session.peerUserId,
        linkId: discoveryPrivate ? null : session.linkId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      messages: messages.map((m) => ({
        id: m.id,
        kind: m.kind,
        body: m.body,
        senderUserId: m.senderUserId,
        createdAt: m.createdAt,
        plainEnglish: m.plainEnglish,
      })),
    };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function listBoardMessages(auth: AgentAuth, sessionId: string) {
  assertAgentScope(auth, "tasks:read");
  try {
    await getSessionForUser(sessionId, auth.user.id);
    const messages = await listMessagesForSession(sessionId, auth.user.id);
    return { ok: true, messages };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function postBoardMessage(
  auth: AgentAuth,
  sessionId: string,
  body: { kind?: string; body?: Record<string, unknown>; text?: string },
) {
  assertAgentScope(auth, "tasks:write");
  try {
    const session = await getSessionForUser(sessionId, auth.user.id);
    const messageBody = {
      ...(body.body ?? {}),
      ...(body.text ? { text: body.text } : {}),
    };
    const message = await postSessionMessage({
      session,
      sender: auth.user,
      kind: body.kind ?? "note",
      body: messageBody,
      actorApiKeyId: auth.apiKey.id,
      actorKind: "agent",
    });
    return { ok: true, message };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

/** Agent discovery: live intents only (pending/rejected stay in the human registry). */
export async function listIntents(query?: string) {
  const intents = (await listRegistryIntents(query)).filter(
    (i) => i.status === "live",
  );
  return { ok: true, intents };
}

export async function listDiscoveryCapabilities(auth: AgentAuth) {
  assertAgentScope(auth, "intents:read");
  return {
    ok: true,
    intents: await listDiscoveryCatalog(auth.user.id),
    agentAccess: {
      canSearch: hasAgentScope(auth, "discovery:read"),
      canEnrollOrRequest: hasAgentScope(auth, "discovery:write"),
      instructions:
        hasAgentScope(auth, "discovery:read") &&
        hasAgentScope(auth, "discovery:write")
          ? "This agent connection can use discovery after declaring supported intent versions."
          : "This existing agent connection predates discovery scopes. Ask the human to re-pair the agent before using discovery.",
    },
    trustModel: {
      discoverableDoesNotMeanIdentifiable: true,
      rawPrivateClaimsSharedBeforeIntroduction: false,
      mutualHumanApprovalRequired: true,
      exactLocationShared: false,
    },
  };
}

export async function setDiscoveryCapabilityManifest(
  auth: AgentAuth,
  body: {
    supportedIntents?: unknown;
    platforms?: unknown;
    metadata?: unknown;
  },
) {
  assertAgentScope(auth, "discovery:write");
  return {
    ok: true,
    capabilityManifest: await upsertAgentCapabilityManifest({
      apiKeyId: auth.apiKey.id,
      supportedIntents: body.supportedIntents,
      platforms: body.platforms,
      metadata: body.metadata,
    }),
  };
}

export async function submitDiscoveryProfile(
  auth: AgentAuth,
  body: {
    intentSlug?: unknown;
    claims?: unknown;
    provenance?: unknown;
    location?: CoarseLocationInput | null;
    requestActivation?: unknown;
  },
) {
  assertAgentScope(auth, "discovery:write");
  assertDiscoveryEnabled();
  await assertDiscoveryRate(auth, "enroll", 20);
  return {
    ok: true,
    enrollment: await submitDiscoveryEnrollment(
      {
        user: auth.user,
        kind: "agent",
        apiKeyId: auth.apiKey.id,
      },
      body,
    ),
  };
}

export async function searchDiscoveryCandidates(
  auth: AgentAuth,
  body: { intentSlug?: unknown; limit?: unknown },
) {
  assertAgentScope(auth, "discovery:read");
  assertDiscoveryEnabled();
  await assertDiscoveryRate(auth, "search", 15);
  const intentSlug =
    typeof body.intentSlug === "string" ? body.intentSlug.trim() : "";
  if (!intentSlug) throw new AgentApiError(400, "intentSlug is required");
  return {
    ok: true,
    ...(await searchDiscovery({
      actor: {
        user: auth.user,
        kind: "agent",
        apiKeyId: auth.apiKey.id,
      },
      intentSlug,
      limit: typeof body.limit === "number" ? body.limit : undefined,
    })),
  };
}

export async function requestDiscoveryInterest(
  auth: AgentAuth,
  body: { candidateHandle?: unknown; idempotencyKey?: unknown },
) {
  assertAgentScope(auth, "discovery:write");
  assertDiscoveryEnabled();
  await assertDiscoveryRate(auth, "interest", 10);
  const candidateHandle =
    typeof body.candidateHandle === "string"
      ? body.candidateHandle.trim()
      : "";
  if (!candidateHandle) {
    throw new AgentApiError(400, "candidateHandle is required");
  }
  return {
    ok: true,
    ...(await requestDiscoveryIntroduction({
      actor: {
        user: auth.user,
        kind: "agent",
        apiKeyId: auth.apiKey.id,
      },
      candidateHandle,
      idempotencyKey:
        typeof body.idempotencyKey === "string"
          ? body.idempotencyKey
          : undefined,
    })),
  };
}

export async function listDiscoveryRequests(auth: AgentAuth) {
  assertAgentScope(auth, "discovery:read");
  const [manifest, catalog] = await Promise.all([
    getAgentCapabilityManifest(auth.apiKey.id),
    listDiscoveryCatalog(auth.user.id),
  ]);
  const supported = manifest?.supportedIntents ?? {};
  const allowed = new Set(
    catalog
      .filter(
        (intent) => supported[intent.slug] === intent.definitionVersion,
      )
      .map((intent) => intent.slug),
  );
  return {
    ok: true,
    interests: (await listDiscoveryInterests(auth.user.id)).filter((interest) =>
      allowed.has(interest.intentSlug),
    ),
  };
}

export async function respondDiscoveryInterest(
  auth: AgentAuth,
  body: { interestId?: unknown; decision?: unknown },
) {
  void body;
  assertAgentScope(auth, "discovery:read");
  throw new AgentApiError(
    403,
    "Discovery introduction decisions are human-only. Direct the human to /app/discovery.",
    { code: "human_approval_required" },
  );
}

export async function blockDiscoveryMatch(
  auth: AgentAuth,
  body: { interestId?: unknown; reasonCode?: unknown },
) {
  void body;
  assertAgentScope(auth, "discovery:read");
  throw new AgentApiError(
    403,
    "Discovery safety decisions are human-only. Direct the human to /app/discovery.",
    { code: "human_approval_required" },
  );
}

export async function reportDiscoveryMatch(
  auth: AgentAuth,
  body: {
    interestId?: unknown;
    reasonCode?: unknown;
    details?: unknown;
    block?: boolean;
  },
) {
  void body;
  assertAgentScope(auth, "discovery:read");
  throw new AgentApiError(
    403,
    "Discovery safety decisions are human-only. Direct the human to /app/discovery.",
    { code: "human_approval_required" },
  );
}

export async function proposeIntent(
  auth: AgentAuth,
  body: {
    name?: string;
    slug?: string;
    description?: string;
    category?: string;
    force?: boolean;
  },
) {
  assertAgentScope(auth, "intents:request");
  const name = normalizeIntentName(body.name ?? "");
  if (!name || name.length < 3) {
    throw new AgentApiError(400, "Name must be at least 3 characters");
  }
  const slug = slugify(body.slug || name);
  if (!slug) {
    throw new AgentApiError(400, "Invalid slug");
  }
  const description =
    boundedText(body.description, "description", 2_000) ?? null;
  const category =
    boundedText(body.category, "category", 60) ?? "coordination";
  const hits = await findDedupeHits(name, slug);
  const exact = isExactDedupeConflict(hits, name, slug);

  if (exact) {
    throw new AgentApiError(409, "An intent with this name or slug already exists", {
      hits,
    });
  }
  if (hits.length > 0 && !body.force) {
    throw new AgentApiError(
      409,
      "Similar intents found. Review matches or resubmit with force=true.",
      { hits, requiresForce: true },
    );
  }

  const db = getDb();
  try {
    const [proposal] = await db
      .insert(intentProposals)
      .values({
        name,
        slug,
        description,
        category,
        status: "pending",
        proposedByUserId: auth.user.id,
        proposedByEmail: auth.user.email,
        triageQueuedAt: new Date(),
      })
      .returning();

    return { ok: true, proposal, triage: { queued: true } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.includes("unique") || message.includes("duplicate")) {
      throw new AgentApiError(409, "Slug already taken", { hits });
    }
    console.error("[agent-api] intent proposal database error", err);
    throw new AgentApiError(503, "Intent proposal is temporarily unavailable");
  }
}

/**
 * request_schedule_meeting — invite if needed, then free/busy, then confirm, then book.
 * Never claims a meeting is booked until HoneyMatcha actually creates the event.
 */
export async function requestScheduleMeeting(
  auth: AgentAuth,
  body: {
    peerEmail?: string;
    peerEmails?: string[];
    linkId?: string;
    durationMinutes?: number;
    windowStart?: string;
    windowEnd?: string;
    timezone?: string;
    title?: string;
    notes?: string;
    idempotencyKey?: string;
    origin?: string;
  },
) {
  assertAgentScope(auth, "tasks:write");
  try {
    return await runScheduleMeeting(auth.user, body, {
      apiKeyId: auth.apiKey.id,
      kind: "agent",
    });
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function listConfirms(
  auth: AgentAuth,
  status?: Confirm["status"],
) {
  assertAgentScope(auth, "approvals:read");
  try {
    const rows = await listConfirmsForUser(auth.user, status);
    return {
      ok: true,
      confirms: rows,
      note: "Confirm responses are human-gated by default. Agents may record a decision only after explicit human OK.",
    };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

export async function requestConfirm(
  auth: AgentAuth,
  body: {
    sessionId?: string;
    action?: string;
    note?: string;
    metadata?: Record<string, unknown>;
    confirmUserId?: string;
  },
) {
  assertAgentScope(auth, "tasks:write");
  try {
    if (!body.sessionId?.trim()) {
      throw new AgentApiError(400, "sessionId is required");
    }
    if (!body.action?.trim()) {
      throw new AgentApiError(400, "action is required");
    }
    const confirm = await requestConfirmForUser({
      user: auth.user,
      sessionId: body.sessionId,
      action: body.action,
      note: body.note,
      metadata: body.metadata,
      confirmUserId: body.confirmUserId,
    });
    return { ok: true, confirm };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

/**
 * respond_confirm — records human decision on a confirm gate.
 * Reserved for explicitly privileged legacy integrations. Default pairings do
 * not receive approvals:write; humans decide at /app/attention.
 * When all schedule_meeting participants approve, books via CalendarPort.
 */
export async function respondConfirm(
  auth: AgentAuth,
  body: {
    confirmId?: string;
    sessionId?: string;
    action?: string;
    note?: string;
  },
) {
  assertAgentScope(auth, "approvals:write");
  const action = body.action?.trim().toLowerCase();
  if (!action || !["approve", "decline", "defer"].includes(action)) {
    throw new AgentApiError(
      400,
      "action must be one of: approve, decline, defer",
    );
  }

  const db = getDb();
  let confirmRow =
    body.confirmId
      ? (
          await db
            .select()
            .from(confirms)
            .where(eq(confirms.id, body.confirmId))
            .limit(1)
        )[0]
      : undefined;

  if (!confirmRow && body.sessionId) {
    const pending = await db
      .select()
      .from(confirms)
      .where(
        and(
          eq(confirms.sessionId, body.sessionId),
          eq(confirms.userId, auth.user.id),
          eq(confirms.status, "pending"),
        ),
      )
      .orderBy(desc(confirms.createdAt))
      .limit(1);
    confirmRow = pending[0];
  }

  if (!confirmRow) {
    throw new AgentApiError(404, "Confirm not found");
  }
  if (confirmRow.userId !== auth.user.id) {
    throw new AgentApiError(403, "Not your confirm gate");
  }
  if (confirmRow.status !== "pending") {
    throw new AgentApiError(409, `Confirm already ${confirmRow.status}`);
  }

  if (action === "defer") {
    const note =
      body.note?.trim() ||
      confirmRow.note ||
      "Deferred — still awaiting human decision";
    const [updated] = await db
      .update(confirms)
      .set({ note })
      .where(eq(confirms.id, confirmRow.id))
      .returning();

    const session = await getSessionForUser(confirmRow.sessionId, auth.user.id);
    await postSessionMessage({
      session,
      sender: auth.user,
      kind: "confirm.deferred",
      body: {
        confirmId: updated.id,
        action: updated.action,
        note: updated.note,
        text: `Deferred: ${updated.action}${
          updated.note ? ` — ${updated.note}` : ""
        }`,
      },
    });

    return {
      ok: true,
      confirm: {
        id: updated.id,
        sessionId: updated.sessionId,
        action: updated.action,
        status: updated.status,
        note: updated.note,
        createdAt: updated.createdAt,
      },
      calendar: {
        status: "deferred",
        message: "Deferred. Still awaiting a final human decision.",
      },
      documentation:
        "This credential has explicit approvals:write access. Default agents cannot decide for a human. Dashboard: /app/attention.",
    };
  }

  try {
    const decision = action === "approve" ? "approved" : "denied";
    const confirm = await decideConfirm({
      user: auth.user,
      confirmId: confirmRow.id,
      decision,
      note: body.note,
      actorApiKeyId: auth.apiKey.id,
      actorKind: "agent",
    });

    return {
      ok: true,
      confirm: {
        id: confirm.id,
        sessionId: confirm.sessionId,
        action: confirm.action,
        status: confirm.status,
        note: confirm.note,
        createdAt: confirm.createdAt,
      },
      calendar: confirm.calendar ?? {
        status: decision === "approved" ? "recorded" : "cancelled",
      },
      documentation:
        "This credential has explicit approvals:write access. Default agents cannot decide for a human. Dashboard: /app/attention.",
    };
  } catch (err) {
    rethrowAsAgentError(err);
  }
}

// Re-export for callers that want plain-English helpers without importing sessions.
export { messageToPlainEnglish };
