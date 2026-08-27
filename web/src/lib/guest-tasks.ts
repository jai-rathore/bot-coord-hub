import { and, count, desc, eq, gt, gte, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  guestResponses,
  guestTasks,
  auditLogs,
  sessionMessages,
  users,
  type GuestTask,
  type User,
} from "@/db/schema";
import { deliverHiringInbox } from "@/lib/agent-inbox";
import { getPublishedProfileByHandle } from "@/lib/agent-profiles";
import { writeAudit } from "@/lib/audit";
import { AgentApiError } from "@/lib/agent-errors";
import { getSessionForUser } from "@/lib/sessions";
import {
  generateGuestToken,
  hashGuestEmail,
  hashGuestIp,
  hashGuestToken,
  matchesGuestEmailHash,
} from "@/lib/guest-tokens";
import {
  assertPayloadSize,
  assertUuid,
  boundedText,
  LIMITS,
} from "@/lib/validation";
import {
  HIRING_DIMENSIONS,
  matchHiringConstraints,
  type CandidateConstraints,
  type HiringConversationSignal,
  type HiringDimension,
  type HiringInterest,
  type HiringSharingMode,
  type RoleConstraints,
} from "@/lib/hiring-match";
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto";
import {
  consumeLocationResolutionToken,
  type CanonicalLocation,
} from "@/lib/location-resolver";
import { getActiveHiringParticipantType } from "@/lib/discovery-service";
import {
  HIRING_CURRENCY_CODES,
  HIRING_EMPLOYMENT_TYPES,
  HIRING_LEVELS,
  HIRING_ROLE_FAMILIES,
  HIRING_WORK_MODES,
} from "@/lib/hiring-options";

export type GuestTaskType =
  "binary_choice" | "text_response" | "availability" | "hiring_compatibility";

export type GuestTaskActor = {
  apiKeyId?: string | null;
  kind?: "user" | "agent" | "hosted_agent";
};

export type GuestResponseActor = {
  userId?: string | null;
  apiKeyId?: string | null;
  kind?: "guest" | "agent" | "hosted_agent";
};

const TASK_TYPES = new Set<GuestTaskType>([
  "binary_choice",
  "text_response",
  "availability",
  "hiring_compatibility",
]);

function normalizeTaskType(value: unknown): GuestTaskType {
  if (typeof value !== "string" || !TASK_TYPES.has(value as GuestTaskType)) {
    throw new AgentApiError(
      400,
      "taskType must be binary_choice, text_response, availability, or hiring_compatibility",
    );
  }
  return value as GuestTaskType;
}

function normalizeConfig(
  taskType: GuestTaskType,
  value: unknown,
): Record<string, unknown> {
  const config =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  assertPayloadSize(config, 4_096, "config");

  if (taskType === "binary_choice") {
    const choices = Array.isArray(config.choices)
      ? [
          ...new Set(
            config.choices
              .filter((choice): choice is string => typeof choice === "string")
              .map((choice) => choice.trim())
              .filter(Boolean),
          ),
        ]
      : [];
    if (choices.length < 2 || choices.length > LIMITS.guestChoices) {
      throw new AgentApiError(
        400,
        `binary_choice requires 2-${LIMITS.guestChoices} choices`,
      );
    }
    if (choices.some((choice) => choice.length > 80)) {
      throw new AgentApiError(
        400,
        "Each choice must be 80 characters or fewer",
      );
    }
    return { choices };
  }

  if (taskType === "text_response") {
    const maxLength = Math.min(
      Math.max(Number(config.maxLength ?? 1_000), 1),
      2_000,
    );
    return { maxLength };
  }

  if (taskType === "hiring_compatibility") {
    return {
      fields: [
        "company interest",
        "role interest and scope",
        "annual compensation and currency",
        "equity",
        "city and vicinity",
        "work mode",
        "employment type",
        "sponsorship",
        "start timing",
        "level",
      ],
      privacy:
        "You choose whether the recruiter sees only alignment gaps or the exact expectations you approve. Your full response stays encrypted.",
    };
  }

  return {
    maxSlots: Math.min(
      Math.max(Number(config.maxSlots ?? 12), 1),
      LIMITS.guestSlots,
    ),
  };
}

function normalizeStringList(
  value: unknown,
  field: string,
): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    throw new AgentApiError(400, `${field} must be a list`);
  }
  const values = [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  if (values.length > 20 || values.some((item) => item.length > 80)) {
    throw new AgentApiError(400, `${field} has too many or overly long values`);
  }
  return values.length ? values : undefined;
}

function normalizeHiringLocations(
  value: unknown,
  field: string,
  resolutionUserId?: string,
): Array<string | CanonicalLocation> | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    throw new AgentApiError(400, `${field} must be a list`);
  }
  const locations = value.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new AgentApiError(400, `${field} must contain location choices`);
    }
    const normalized = item.trim();
    if (normalized.startsWith("hlr_")) {
      if (!resolutionUserId) {
        throw new AgentApiError(
          400,
          `${field} location token cannot be verified`,
        );
      }
      return consumeLocationResolutionToken(
        resolutionUserId,
        normalized,
        "city",
      );
    }
    if (normalized.length > 120) {
      throw new AgentApiError(400, `${field} contains an overly long value`);
    }
    return normalized;
  });
  if (locations.length > 20) {
    throw new AgentApiError(400, `${field} has too many values`);
  }
  return locations.length ? locations : undefined;
}

function normalizeHiringEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new AgentApiError(400, `${field} is invalid`);
  }
  return value as T;
}

function normalizeHiringEnumList<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T[] | undefined {
  const values = normalizeStringList(value, field);
  if (!values) return undefined;
  const invalid = values.filter((item) => !allowed.includes(item as T));
  if (invalid.length) {
    throw new AgentApiError(400, `${field} is invalid`);
  }
  return values as T[];
}

function normalizeRoleConstraints(
  taskType: GuestTaskType,
  value: unknown,
  resolutionUserId?: string,
): Record<string, unknown> {
  if (taskType !== "hiring_compatibility") return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentApiError(
      400,
      "privateConfig with role constraints is required for hiring compatibility",
    );
  }
  const input = value as Record<string, unknown>;
  const compensationMaximum =
    input.compensationMaximum == null
      ? undefined
      : Number(input.compensationMaximum);
  if (
    compensationMaximum != null &&
    (!Number.isFinite(compensationMaximum) ||
      compensationMaximum <= 0 ||
      compensationMaximum > 10_000_000)
  ) {
    throw new AgentApiError(400, "compensationMaximum is invalid");
  }
  const equityMaximumPercent =
    input.equityMaximumPercent == null
      ? undefined
      : Number(input.equityMaximumPercent);
  if (
    equityMaximumPercent != null &&
    (!Number.isFinite(equityMaximumPercent) ||
      equityMaximumPercent < 0 ||
      equityMaximumPercent > 100)
  ) {
    throw new AgentApiError(400, "equityMaximumPercent is invalid");
  }
  const latestStart =
    boundedText(input.latestStart, "latestStart", 40) ?? undefined;
  if (latestStart && Number.isNaN(new Date(latestStart).getTime())) {
    throw new AgentApiError(400, "latestStart must be a date");
  }
  const sponsorshipAvailable =
    typeof input.sponsorshipAvailable === "boolean"
      ? input.sponsorshipAvailable
      : undefined;
  const compensationCurrency = normalizeHiringEnum(
    input.compensationCurrency,
    "compensationCurrency",
    HIRING_CURRENCY_CODES,
  );
  const locationRadiusMiles =
    input.locationRadiusMiles == null
      ? undefined
      : Number(input.locationRadiusMiles);
  if (
    locationRadiusMiles != null &&
    (!Number.isFinite(locationRadiusMiles) ||
      locationRadiusMiles < 0 ||
      locationRadiusMiles > 500)
  ) {
    throw new AgentApiError(400, "locationRadiusMiles is invalid");
  }
  return {
    ...(boundedText(input.companyName, "companyName", 120)
      ? { companyName: boundedText(input.companyName, "companyName", 120) }
      : {}),
    ...(boundedText(input.roleTitle, "roleTitle", 120)
      ? { roleTitle: boundedText(input.roleTitle, "roleTitle", 120) }
      : {}),
    ...(compensationMaximum == null ? {} : { compensationMaximum }),
    ...(compensationCurrency ? { compensationCurrency } : {}),
    ...(equityMaximumPercent == null ? {} : { equityMaximumPercent }),
    ...(normalizeHiringLocations(input.locations, "locations", resolutionUserId)
      ? {
          locations: normalizeHiringLocations(
            input.locations,
            "locations",
            resolutionUserId,
          ),
        }
      : {}),
    ...(locationRadiusMiles == null ? {} : { locationRadiusMiles }),
    ...(normalizeHiringEnumList(input.workModes, "workModes", HIRING_WORK_MODES)
      ? {
          workModes: normalizeHiringEnumList(
            input.workModes,
            "workModes",
            HIRING_WORK_MODES,
          ),
        }
      : {}),
    ...(normalizeHiringEnumList(
      input.employmentTypes,
      "employmentTypes",
      HIRING_EMPLOYMENT_TYPES,
    )
      ? {
          employmentTypes: normalizeHiringEnumList(
            input.employmentTypes,
            "employmentTypes",
            HIRING_EMPLOYMENT_TYPES,
          ),
        }
      : {}),
    ...(sponsorshipAvailable == null ? {} : { sponsorshipAvailable }),
    ...(latestStart ? { latestStart } : {}),
    ...(normalizeHiringEnumList(input.levels, "levels", HIRING_LEVELS)
      ? { levels: normalizeHiringEnumList(input.levels, "levels", HIRING_LEVELS) }
      : {}),
    ...(normalizeHiringEnumList(
      input.roleFocus,
      "roleFocus",
      HIRING_ROLE_FAMILIES,
    )
      ? {
          roleFocus: normalizeHiringEnumList(
            input.roleFocus,
            "roleFocus",
            HIRING_ROLE_FAMILIES,
          ),
        }
      : {}),
  };
}

function candidateFacingRoleTerms(
  privateConfig: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(typeof privateConfig.companyName === "string"
      ? { companyName: privateConfig.companyName }
      : {}),
    ...(typeof privateConfig.roleTitle === "string"
      ? { roleTitle: privateConfig.roleTitle }
      : {}),
    ...(typeof privateConfig.compensationMaximum === "number"
      ? { compensationMaximum: privateConfig.compensationMaximum }
      : {}),
    ...(typeof privateConfig.compensationCurrency === "string"
      ? { compensationCurrency: privateConfig.compensationCurrency }
      : {}),
    ...(typeof privateConfig.equityMaximumPercent === "number"
      ? { equityMaximumPercent: privateConfig.equityMaximumPercent }
      : {}),
    ...(Array.isArray(privateConfig.locations)
      ? { locations: privateConfig.locations }
      : {}),
    ...(typeof privateConfig.locationRadiusMiles === "number"
      ? { locationRadiusMiles: privateConfig.locationRadiusMiles }
      : {}),
    ...(Array.isArray(privateConfig.workModes)
      ? { workModes: privateConfig.workModes }
      : {}),
    ...(Array.isArray(privateConfig.employmentTypes)
      ? { employmentTypes: privateConfig.employmentTypes }
      : {}),
    ...(typeof privateConfig.sponsorshipAvailable === "boolean"
      ? { sponsorshipAvailable: privateConfig.sponsorshipAvailable }
      : {}),
    ...(typeof privateConfig.latestStart === "string"
      ? { latestStart: privateConfig.latestStart }
      : {}),
    ...(Array.isArray(privateConfig.levels)
      ? { levels: privateConfig.levels }
      : {}),
    ...(Array.isArray(privateConfig.roleFocus)
      ? { roleFocus: privateConfig.roleFocus }
      : {}),
  };
}

function serializeTask(task: GuestTask) {
  return {
    publicId: task.publicId,
    taskType: task.taskType,
    title: task.title,
    description: task.description,
    config: task.config,
    status: task.status,
    sessionId: task.sessionId,
    expiresAt: task.expiresAt.toISOString(),
    maxResponses: task.maxResponses,
    responseCount: task.responseCount,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export async function createGuestTask(opts: {
  organizer: User;
  taskType: unknown;
  title: unknown;
  description?: unknown;
  config?: unknown;
  privateConfig?: unknown;
  targetEmail?: unknown;
  expiresInMinutes?: unknown;
  maxResponses?: unknown;
  sessionId?: unknown;
  origin: string;
  actor?: GuestTaskActor;
  /** Stable replay key for a durable hosted-agent creation job. */
  idempotencyKey?: unknown;
}) {
  const idempotencyKey =
    boundedText(opts.idempotencyKey, "idempotencyKey", 160) ?? null;
  const origin = opts.origin.replace(/\/$/, "");
  if (idempotencyKey) {
    const [existing] = await getDb()
      .select()
      .from(guestTasks)
      .where(
        and(
          eq(guestTasks.organizerUserId, opts.organizer.id),
          eq(guestTasks.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      if (!existing.tokenEncrypted) {
        throw new AgentApiError(
          409,
          "This guest request predates replay-safe links. Create a new request.",
        );
      }
      const rawToken = decryptSecret(existing.tokenEncrypted);
      return {
        task: serializeTask(existing),
        rawToken,
        guestUrl: `${origin}/guest/${existing.publicId}#${rawToken}`,
        warning:
          "This private response link is shown only to you. Share it only with the recipient.",
      };
    }
  }
  const taskType = normalizeTaskType(opts.taskType);
  const title = boundedText(opts.title, "title", LIMITS.titleLength, {
    required: true,
  })!;
  const description =
    boundedText(opts.description, "description", LIMITS.descriptionLength) ??
    null;
  const targetEmail = boundedText(opts.targetEmail, "targetEmail", 320, {
    required: true,
  })!.toLowerCase();
  if (!targetEmail.includes("@")) {
    throw new AgentApiError(400, "targetEmail must be a valid email");
  }
  const normalizedConfig = normalizeConfig(taskType, opts.config);
  const normalizedPrivateConfig = normalizeRoleConstraints(
    taskType,
    opts.privateConfig,
    opts.organizer.id,
  );
  const [targetUser] =
    taskType === "hiring_compatibility"
      ? await getDb()
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, targetEmail))
          .limit(1)
      : [];
  const privateConfig = {
    ...normalizedPrivateConfig,
    ...(targetUser?.id ? { _targetUserId: targetUser.id } : {}),
  };
  const config =
    taskType === "hiring_compatibility"
      ? {
          ...normalizedConfig,
          offer: candidateFacingRoleTerms(privateConfig),
          revisionCount: 0,
        }
      : normalizedConfig;
  const expiresInMinutes = Math.floor(
    Math.min(
      Math.max(Number(opts.expiresInMinutes ?? 7 * 24 * 60), 15),
      30 * 24 * 60,
    ),
  );
  const maxResponses = Math.floor(
    Math.min(Math.max(Number(opts.maxResponses ?? 1), 1), 20),
  );
  const sessionId = opts.sessionId
    ? assertUuid(opts.sessionId, "sessionId")
    : null;
  if (sessionId) {
    await getSessionForUser(sessionId, opts.organizer.id);
  }

  const db = getDb();
  const [{ openCount }] = await db
    .select({ openCount: count() })
    .from(guestTasks)
    .where(
      and(
        eq(guestTasks.organizerUserId, opts.organizer.id),
        eq(guestTasks.status, "open"),
        gt(guestTasks.expiresAt, new Date()),
      ),
    );
  if (Number(openCount) >= 20) {
    throw new AgentApiError(
      429,
      "You already have 20 open guest requests. Complete or revoke one first.",
    );
  }
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  const [{ dailyCount }] = await db
    .select({ dailyCount: count() })
    .from(guestTasks)
    .where(
      and(
        eq(guestTasks.organizerUserId, opts.organizer.id),
        gte(guestTasks.createdAt, dayAgo),
      ),
    );
  if (Number(dailyCount) >= 100) {
    throw new AgentApiError(
      429,
      "Daily guest request limit reached. Try again later.",
    );
  }

  const { rawToken, tokenHash, tokenPrefix } = generateGuestToken();
  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(guestTasks)
      .values({
        organizerUserId: opts.organizer.id,
        taskType,
        title,
        description,
        config,
        privateConfig,
        sessionId,
        targetEmailHash: hashGuestEmail(targetEmail),
        tokenHash,
        tokenPrefix,
        tokenEncrypted:
          idempotencyKey || taskType === "hiring_compatibility"
            ? encryptSecret(rawToken)
            : null,
        idempotencyKey,
        expiresAt: new Date(Date.now() + expiresInMinutes * 60_000),
        maxResponses,
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted && idempotencyKey) {
      const [replayed] = await tx
        .select()
        .from(guestTasks)
        .where(
          and(
            eq(guestTasks.organizerUserId, opts.organizer.id),
            eq(guestTasks.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (replayed) return replayed;
    }
    if (!inserted) {
      throw new AgentApiError(
        500,
        "Could not create the guest request. Try again.",
      );
    }
    await tx.insert(auditLogs).values({
      actorUserId: opts.organizer.id,
      actorApiKeyId: opts.actor?.apiKeyId ?? null,
      actorKind: opts.actor?.kind ?? "user",
      action: "guest_task.created",
      entityType: "guest_task",
      entityId: inserted.id,
      metadata: {
        publicId: inserted.publicId,
        taskType,
        expiresAt: inserted.expiresAt.toISOString(),
      },
    });
    return inserted;
  });
  const effectiveRawToken =
    created.tokenHash === tokenHash
      ? rawToken
      : created.tokenEncrypted
        ? decryptSecret(created.tokenEncrypted)
        : null;
  if (!effectiveRawToken) {
    throw new AgentApiError(
      409,
      "This guest request could not be replayed safely. Create a new request.",
    );
  }
  return {
    task: serializeTask(created),
    rawToken: effectiveRawToken,
    guestUrl: `${origin}/guest/${created.publicId}#${effectiveRawToken}`,
    warning: idempotencyKey
      ? "This private response link is shown only to you. Share it only with the recipient."
      : "This private response link is shown once. Share it only with the recipient.",
  };
}

export async function createHiringProposalForHandle(opts: {
  organizer: User;
  targetHandle: unknown;
  title: unknown;
  description?: unknown;
  privateConfig?: unknown;
  origin: string;
  idempotencyKey?: unknown;
  actor?: GuestTaskActor;
}) {
  const targetHandle = boundedText(opts.targetHandle, "targetHandle", 80, {
    required: true,
  })!;
  const target = await getPublishedProfileByHandle(targetHandle);
  if (!target) {
    throw new AgentApiError(404, "Candidate recruiting link not found");
  }
  if (target.owner.id === opts.organizer.id) {
    throw new AgentApiError(400, "You cannot send a role to your own agent");
  }
  if ((await getActiveHiringParticipantType(target.owner.id)) !== "candidate") {
    throw new AgentApiError(
      409,
      "This person is not currently accepting private role briefs",
    );
  }

  const created = await createGuestTask({
    organizer: opts.organizer,
    taskType: "hiring_compatibility",
    title: opts.title,
    description: opts.description,
    privateConfig: opts.privateConfig,
    targetEmail: target.owner.email,
    expiresInMinutes: 7 * 24 * 60,
    maxResponses: 1,
    origin: opts.origin,
    idempotencyKey: opts.idempotencyKey,
    actor: opts.actor,
  });
  const notification = await notifyHiringCandidateAgent({
    organizer: opts.organizer,
    publicId: created.task.publicId,
  });
  return {
    task: created.task,
    publicId: created.task.publicId,
    notification,
    message:
      "The role is with the candidate's agent. It can return approved gaps or ask you to improve adjustable terms.",
  };
}

export async function listGuestTasksForOrganizer(organizer: User) {
  const rows = await getDb()
    .select()
    .from(guestTasks)
    .where(eq(guestTasks.organizerUserId, organizer.id))
    .orderBy(desc(guestTasks.createdAt));
  return rows.map(serializeTask);
}

export async function getGuestTaskForOrganizer(
  organizer: User,
  publicId: string,
) {
  const db = getDb();
  const [task] = await db
    .select()
    .from(guestTasks)
    .where(
      and(
        eq(guestTasks.publicId, publicId),
        eq(guestTasks.organizerUserId, organizer.id),
      ),
    )
    .limit(1);
  if (!task) throw new AgentApiError(404, "Guest request not found");
  const responses = await db
    .select({
      id: guestResponses.id,
      response: guestResponses.response,
      createdAt: guestResponses.createdAt,
    })
    .from(guestResponses)
    .where(eq(guestResponses.guestTaskId, task.id))
    .orderBy(desc(guestResponses.createdAt));
  return {
    task: serializeTask(task),
    ...(task.taskType === "hiring_compatibility"
      ? {
          offer: candidateFacingRoleTerms(
            task.privateConfig as Record<string, unknown>,
          ),
        }
      : {}),
    responses: responses.map((response) => ({
      ...response,
      createdAt: response.createdAt.toISOString(),
    })),
  };
}

export async function listHiringAlignmentsForOrganizer(organizer: User) {
  const tasks = await getDb()
    .select()
    .from(guestTasks)
    .where(
      and(
        eq(guestTasks.organizerUserId, organizer.id),
        eq(guestTasks.taskType, "hiring_compatibility"),
      ),
    )
    .orderBy(desc(guestTasks.createdAt));

  return Promise.all(
    tasks.map(async (task) => {
      const [latest] = await getDb()
        .select({
          id: guestResponses.id,
          response: guestResponses.response,
          createdAt: guestResponses.createdAt,
        })
        .from(guestResponses)
        .where(eq(guestResponses.guestTaskId, task.id))
        .orderBy(desc(guestResponses.createdAt))
        .limit(1);
      return {
        task: serializeTask(task),
        offer: candidateFacingRoleTerms(task.privateConfig),
        latestAlignment: latest
          ? {
              id: latest.id,
              response: latest.response,
              createdAt: latest.createdAt.toISOString(),
            }
          : null,
      };
    }),
  );
}

async function hiringTaskForOrganizer(organizer: User, publicId: string) {
  const [task] = await getDb()
    .select()
    .from(guestTasks)
    .where(
      and(
        eq(guestTasks.publicId, publicId),
        eq(guestTasks.organizerUserId, organizer.id),
        eq(guestTasks.taskType, "hiring_compatibility"),
      ),
    )
    .limit(1);
  if (!task) throw new AgentApiError(404, "Hiring alignment request not found");
  return task;
}

function targetUserIdForHiringTask(task: GuestTask): string | null {
  const value = (task.privateConfig as Record<string, unknown>)._targetUserId;
  return typeof value === "string" ? value : null;
}

export async function notifyHiringCandidateAgent(opts: {
  organizer: User;
  publicId: string;
}) {
  const task = await hiringTaskForOrganizer(opts.organizer, opts.publicId);
  if (
    task.revokedAt ||
    task.expiresAt <= new Date() ||
    ["revoked", "expired"].includes(task.status)
  ) {
    throw new AgentApiError(409, "This hiring alignment is no longer active");
  }
  const targetUserId = targetUserIdForHiringTask(task);
  if (!targetUserId) {
    return {
      delivered: false,
      reach: "share_private_link" as const,
      message:
        "No HoneyMatcha candidate agent was found. Send the private link yourself.",
    };
  }
  const delivered = await deliverHiringInbox({
    userId: targetUserId,
    kind: "hiring.alignment_requested",
    summary: `A recruiter asked to align on ${task.title}`,
    body: {
      publicId: task.publicId,
      title: task.title,
      offer: candidateFacingRoleTerms(task.privateConfig),
      instructions:
        "Call read_inbound_hiring_request, review the role with your human, then call respond_to_hiring_request only with expectations they approve sharing.",
    },
    dedupeKey: `hiring:${task.id}:request`,
  });
  await writeAudit({
    actorUserId: opts.organizer.id,
    actorKind: "user",
    action: "hiring.candidate_agent_notified",
    entityType: "guest_task",
    entityId: task.id,
    metadata: { publicId: task.publicId, inboxId: delivered.inboxId },
  });
  return {
    delivered: true,
    reach: "candidate_agent" as const,
    message:
      "The request is in the candidate's HoneyMatcha agent inbox. The candidate still decides what to share.",
  };
}

export async function reviseHiringGuestTask(opts: {
  organizer: User;
  publicId: string;
  privateConfig: unknown;
  candidateFacingUpdate?: unknown;
  actor?: GuestTaskActor;
}) {
  const task = await hiringTaskForOrganizer(opts.organizer, opts.publicId);
  if (
    task.revokedAt ||
    task.expiresAt <= new Date() ||
    ["revoked", "expired"].includes(task.status)
  ) {
    throw new AgentApiError(409, "This hiring alignment is no longer active");
  }
  const revised = normalizeRoleConstraints(
    "hiring_compatibility",
    opts.privateConfig,
    opts.organizer.id,
  );
  if (!Object.keys(revised).length) {
    throw new AgentApiError(400, "Add at least one revised role term");
  }
  const privateConfig = {
    ...(task.privateConfig as Record<string, unknown>),
    ...revised,
  };
  const currentConfig = task.config as Record<string, unknown>;
  const revisionCount = Number(currentConfig.revisionCount ?? 0) + 1;
  const candidateFacingUpdate = boundedText(
    opts.candidateFacingUpdate,
    "candidateFacingUpdate",
    1_000,
  );
  const config = {
    ...currentConfig,
    offer: candidateFacingRoleTerms(privateConfig),
    revisionCount,
    ...(candidateFacingUpdate ? { candidateFacingUpdate } : {}),
  };

  const db = getDb();
  const [latest] = await db
    .select()
    .from(guestResponses)
    .where(eq(guestResponses.guestTaskId, task.id))
    .orderBy(desc(guestResponses.createdAt))
    .limit(1);
  let alignment: Record<string, unknown> | null = null;
  if (latest?.privateResponse) {
    const candidate = JSON.parse(
      decryptSecret(latest.privateResponse),
    ) as CandidateConstraints;
    if (
      candidate.recruiterMayRevise === false ||
      candidate.conversationSignal === "not_interested" ||
      candidate.companyInterest === "not_interested"
    ) {
      throw new AgentApiError(
        409,
        "The candidate did not approve revised outreach. Respect their signal.",
      );
    }
    alignment = matchHiringConstraints(
      privateConfig as RoleConstraints,
      candidate,
    ) as unknown as Record<string, unknown>;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(guestTasks)
      .set({ privateConfig, config, updatedAt: new Date() })
      .where(eq(guestTasks.id, task.id));
    if (latest && alignment) {
      await tx
        .update(guestResponses)
        .set({ response: alignment })
        .where(eq(guestResponses.id, latest.id));
    }
  });

  await writeAudit({
    actorUserId: opts.organizer.id,
    actorApiKeyId: opts.actor?.apiKeyId ?? null,
    actorKind: opts.actor?.kind ?? "user",
    action: "hiring.role_revised",
    entityType: "guest_task",
    entityId: task.id,
    metadata: {
      publicId: task.publicId,
      revisionCount,
      alignment: alignment?.alignment ?? null,
    },
  });

  const targetUserId = targetUserIdForHiringTask(task);
  if (targetUserId) {
    await deliverHiringInbox({
      userId: targetUserId,
      kind: "hiring.role_revised",
      summary: `The recruiter revised the terms for ${task.title}`,
      body: {
        publicId: task.publicId,
        revisionCount,
        offer: candidateFacingRoleTerms(privateConfig),
        alignment,
        candidateFacingUpdate: candidateFacingUpdate ?? null,
        instructions:
          "Call read_inbound_hiring_request and show the revised terms to your human. Do not accept an introduction without their final yes.",
      },
      dedupeKey: `hiring:${task.id}:revision:${revisionCount}`,
    }).catch((error) => {
      console.error(
        "[hiring] candidate agent revision notification failed",
        error,
      );
    });
  }

  return {
    ...(await getGuestTaskForOrganizer(opts.organizer, opts.publicId)),
    offer: candidateFacingRoleTerms(privateConfig),
    alignment,
    revisionCount,
  };
}

async function inboundHiringTask(user: User, publicId: string) {
  const [task] = await getDb()
    .select()
    .from(guestTasks)
    .where(
      and(
        eq(guestTasks.publicId, publicId),
        eq(guestTasks.taskType, "hiring_compatibility"),
      ),
    )
    .limit(1);
  if (
    !task ||
    !task.targetEmailHash ||
    !matchesGuestEmailHash(task.targetEmailHash, user.email)
  ) {
    throw new AgentApiError(404, "Inbound hiring request not found");
  }
  if (
    task.revokedAt ||
    task.expiresAt <= new Date() ||
    ["revoked", "expired"].includes(task.status)
  ) {
    throw new AgentApiError(
      410,
      "This inbound hiring request is no longer active",
    );
  }
  return task;
}

export async function readInboundHiringRequest(user: User, publicId: string) {
  const task = await inboundHiringTask(user, publicId);
  const [latest] = await getDb()
    .select({ response: guestResponses.response })
    .from(guestResponses)
    .where(eq(guestResponses.guestTaskId, task.id))
    .orderBy(desc(guestResponses.createdAt))
    .limit(1);
  return {
    publicId: task.publicId,
    title: task.title,
    description: task.description,
    offer: candidateFacingRoleTerms(task.privateConfig),
    candidateFacingUpdate:
      (task.config as Record<string, unknown>).candidateFacingUpdate ?? null,
    revisionCount: Number(
      (task.config as Record<string, unknown>).revisionCount ?? 0,
    ),
    status: task.status,
    expiresAt: task.expiresAt.toISOString(),
    latestAlignment: latest?.response ?? null,
    instructions:
      "Share only expectations your human approved. A ready-for-intro result still requires their final yes.",
  };
}

export async function respondToInboundHiringRequest(opts: {
  user: User;
  publicId: string;
  response: unknown;
  idempotencyKey: unknown;
  actor?: GuestResponseActor;
}) {
  const task = await inboundHiringTask(opts.user, opts.publicId);
  if (!task.tokenEncrypted) {
    throw new AgentApiError(
      409,
      "This older request can only be answered through its private link",
    );
  }
  return respondToGuestTask({
    publicId: task.publicId,
    rawToken: decryptSecret(task.tokenEncrypted),
    email: opts.user.email,
    response: opts.response,
    idempotencyKey: opts.idempotencyKey,
    clientIp: "agent-authenticated",
    actor: opts.actor ?? { userId: opts.user.id, kind: "agent" },
  });
}

export async function revokeGuestTask(
  organizer: User,
  publicId: string,
  actor: GuestTaskActor = { kind: "user" },
) {
  const [updated] = await getDb()
    .update(guestTasks)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(guestTasks.publicId, publicId),
        eq(guestTasks.organizerUserId, organizer.id),
        eq(guestTasks.status, "open"),
      ),
    )
    .returning();
  if (!updated) {
    throw new AgentApiError(404, "Open guest request not found");
  }
  await writeAudit({
    actorUserId: organizer.id,
    actorApiKeyId: actor.apiKeyId ?? null,
    actorKind: actor.kind ?? "user",
    action: "guest_task.revoked",
    entityType: "guest_task",
    entityId: updated.id,
    metadata: { publicId },
  });
  return serializeTask(updated);
}

async function resolveGuestTask(publicId: string, rawToken: string) {
  const db = getDb();
  const [task] = await db
    .select()
    .from(guestTasks)
    .where(
      and(
        eq(guestTasks.publicId, publicId),
        eq(guestTasks.tokenHash, hashGuestToken(rawToken)),
      ),
    )
    .limit(1);
  if (!task) throw new AgentApiError(404, "Guest request not found");
  if (task.revokedAt || task.status === "revoked") {
    throw new AgentApiError(410, "This private response link was revoked");
  }
  if (task.expiresAt <= new Date() || task.status === "expired") {
    if (task.status === "open") {
      await db
        .update(guestTasks)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(guestTasks.id, task.id));
    }
    throw new AgentApiError(410, "This private response link expired");
  }
  return task;
}

export async function readGuestTask(publicId: string, rawToken: string) {
  const task = await resolveGuestTask(publicId, rawToken);
  const [latestResponse] =
    task.taskType === "hiring_compatibility"
      ? await getDb()
          .select({ response: guestResponses.response })
          .from(guestResponses)
          .where(eq(guestResponses.guestTaskId, task.id))
          .orderBy(desc(guestResponses.createdAt))
          .limit(1)
      : [];
  return {
    publicId: task.publicId,
    taskType: task.taskType,
    title: task.title,
    description: task.description,
    config: task.config,
    status: task.status,
    expiresAt: task.expiresAt.toISOString(),
    requiresEmail: Boolean(task.targetEmailHash),
    remainingResponses: Math.max(0, task.maxResponses - task.responseCount),
    ...(latestResponse ? { latestAlignment: latestResponse.response } : {}),
  };
}

function validateResponse(
  task: GuestTask,
  value: unknown,
): {
  publicResponse: Record<string, unknown>;
  privateResponse?: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentApiError(400, "response must be an object");
  }
  const response = value as Record<string, unknown>;
  assertPayloadSize(response, LIMITS.guestResponseBytes, "response");

  if (task.taskType === "binary_choice") {
    const choices = Array.isArray(
      (task.config as Record<string, unknown>).choices,
    )
      ? ((task.config as Record<string, unknown>).choices as unknown[])
      : [];
    const choice = boundedText(response.choice, "choice", 80, {
      required: true,
    })!;
    if (!choices.includes(choice)) {
      throw new AgentApiError(400, "choice is not allowed for this request");
    }
    const note = boundedText(response.note, "note", 500);
    return { publicResponse: { choice, ...(note ? { note } : {}) } };
  }

  if (task.taskType === "text_response") {
    const maxLength = Number(
      (task.config as Record<string, unknown>).maxLength ?? 1_000,
    );
    return {
      publicResponse: {
        text: boundedText(response.text, "text", maxLength, {
          required: true,
        })!,
      },
    };
  }

  if (task.taskType === "hiring_compatibility") {
    const companyInterest = normalizeHiringEnum<HiringInterest>(
      response.companyInterest,
      "companyInterest",
      ["interested", "open", "not_interested"],
    );
    const roleInterest = normalizeHiringEnum<HiringInterest>(
      response.roleInterest,
      "roleInterest",
      ["interested", "open", "not_interested"],
    );
    const sharingMode =
      normalizeHiringEnum<HiringSharingMode>(
        response.sharingMode,
        "sharingMode",
        ["gaps_only", "exact_expectations"],
      ) ?? "gaps_only";
    const conversationSignal = normalizeHiringEnum<HiringConversationSignal>(
      response.conversationSignal,
      "conversationSignal",
      ["ready_if_aligned", "open_to_revision", "not_interested"],
    );
    const compensationMinimum =
      response.compensationMinimum == null
        ? undefined
        : Number(response.compensationMinimum);
    if (
      compensationMinimum != null &&
      (!Number.isFinite(compensationMinimum) ||
        compensationMinimum <= 0 ||
        compensationMinimum > 10_000_000)
    ) {
      throw new AgentApiError(400, "compensationMinimum is invalid");
    }
    const equityMinimumPercent =
      response.equityMinimumPercent == null
        ? undefined
        : Number(response.equityMinimumPercent);
    if (
      equityMinimumPercent != null &&
      (!Number.isFinite(equityMinimumPercent) ||
        equityMinimumPercent < 0 ||
        equityMinimumPercent > 100)
    ) {
      throw new AgentApiError(400, "equityMinimumPercent is invalid");
    }
    const compensationCurrency = normalizeHiringEnum(
      response.compensationCurrency,
      "compensationCurrency",
      HIRING_CURRENCY_CODES,
    );
    const locationRadiusMiles =
      response.locationRadiusMiles == null
        ? undefined
        : Number(response.locationRadiusMiles);
    if (
      locationRadiusMiles != null &&
      (!Number.isFinite(locationRadiusMiles) ||
        locationRadiusMiles < 0 ||
        locationRadiusMiles > 500)
    ) {
      throw new AgentApiError(400, "locationRadiusMiles is invalid");
    }
    const earliestStart =
      boundedText(response.earliestStart, "earliestStart", 40) ?? undefined;
    if (earliestStart && Number.isNaN(new Date(earliestStart).getTime())) {
      throw new AgentApiError(400, "earliestStart must be a date");
    }
    const candidate: CandidateConstraints = {
      ...(companyInterest ? { companyInterest } : {}),
      ...(roleInterest ? { roleInterest } : {}),
      ...(compensationMinimum == null ? {} : { compensationMinimum }),
      ...(compensationCurrency ? { compensationCurrency } : {}),
      ...(equityMinimumPercent == null ? {} : { equityMinimumPercent }),
      ...(normalizeHiringLocations(
        response.locations,
        "locations",
        `guest-task:${task.publicId}`,
      )
        ? {
            locations: normalizeHiringLocations(
              response.locations,
              "locations",
              `guest-task:${task.publicId}`,
            ),
          }
        : {}),
      ...(locationRadiusMiles == null ? {} : { locationRadiusMiles }),
      ...(normalizeHiringEnumList(
        response.workModes,
        "workModes",
        HIRING_WORK_MODES,
      )
        ? {
            workModes: normalizeHiringEnumList(
              response.workModes,
              "workModes",
              HIRING_WORK_MODES,
            ),
          }
        : {}),
      ...(normalizeHiringEnumList(
        response.employmentTypes,
        "employmentTypes",
        HIRING_EMPLOYMENT_TYPES,
      )
        ? {
            employmentTypes: normalizeHiringEnumList(
              response.employmentTypes,
              "employmentTypes",
              HIRING_EMPLOYMENT_TYPES,
            ),
          }
        : {}),
      ...(typeof response.sponsorshipRequired === "boolean"
        ? { sponsorshipRequired: response.sponsorshipRequired }
        : {}),
      ...(earliestStart ? { earliestStart } : {}),
      ...(normalizeHiringEnumList(response.levels, "levels", HIRING_LEVELS)
        ? {
            levels: normalizeHiringEnumList(
              response.levels,
              "levels",
              HIRING_LEVELS,
            ),
          }
        : {}),
      ...(normalizeHiringEnumList(
        response.roleFocus,
        "roleFocus",
        HIRING_ROLE_FAMILIES,
      )
        ? {
            roleFocus: normalizeHiringEnumList(
              response.roleFocus,
              "roleFocus",
              HIRING_ROLE_FAMILIES,
            ),
          }
        : {}),
      sharingMode,
      ...(normalizeStringList(response.priorityDimensions, "priorityDimensions")
        ? {
            priorityDimensions: normalizeStringList(
              response.priorityDimensions,
              "priorityDimensions",
            )!.filter((value): value is HiringDimension =>
              HIRING_DIMENSIONS.includes(value as HiringDimension),
            ),
          }
        : {}),
      ...(typeof response.recruiterMayRevise === "boolean"
        ? { recruiterMayRevise: response.recruiterMayRevise }
        : {}),
      ...(conversationSignal ? { conversationSignal } : {}),
      ...(boundedText(response.approvedNote, "approvedNote", 1_000)
        ? {
            approvedNote: boundedText(
              response.approvedNote,
              "approvedNote",
              1_000,
            )!,
          }
        : {}),
    };
    const match = matchHiringConstraints(
      task.privateConfig as RoleConstraints,
      candidate,
    );
    return {
      publicResponse: match as unknown as Record<string, unknown>,
      privateResponse: encryptSecret(JSON.stringify(candidate)),
    };
  }

  const slots = Array.isArray(response.slots) ? response.slots : [];
  const maxSlots = Number(
    (task.config as Record<string, unknown>).maxSlots ?? 12,
  );
  if (!slots.length || slots.length > maxSlots) {
    throw new AgentApiError(
      400,
      `Provide between 1 and ${maxSlots} available times`,
    );
  }
  return {
    publicResponse: {
      slots: slots.map((slot, index) => {
        if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
          throw new AgentApiError(400, `slots[${index}] must be an object`);
        }
        const candidate = slot as Record<string, unknown>;
        const start = new Date(String(candidate.start ?? ""));
        const end = new Date(String(candidate.end ?? ""));
        if (
          Number.isNaN(start.getTime()) ||
          Number.isNaN(end.getTime()) ||
          end <= start
        ) {
          throw new AgentApiError(400, `slots[${index}] has invalid times`);
        }
        return {
          start: start.toISOString(),
          end: end.toISOString(),
          timezone:
            boundedText(candidate.timezone, `slots[${index}].timezone`, 80) ??
            "UTC",
        };
      }),
    },
  };
}

export async function respondToGuestTask(opts: {
  publicId: string;
  rawToken: string;
  email: unknown;
  response: unknown;
  idempotencyKey: unknown;
  clientIp: string;
  actor?: GuestResponseActor;
}) {
  const idempotencyKey = assertUuid(opts.idempotencyKey, "Idempotency-Key");
  const email = boundedText(opts.email, "email", 320, {
    required: true,
  })!.toLowerCase();
  const task = await resolveGuestTask(opts.publicId, opts.rawToken);
  const emailHash = hashGuestEmail(email);
  if (
    task.targetEmailHash &&
    !matchesGuestEmailHash(task.targetEmailHash, email)
  ) {
    throw new AgentApiError(
      403,
      "Use the email address this private request was sent to",
    );
  }
  const response = validateResponse(task, opts.response);
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(guestResponses)
      .where(
        and(
          eq(guestResponses.guestTaskId, task.id),
          eq(guestResponses.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return { response: existing, idempotent: true };

    const [updatedTask] = await tx
      .update(guestTasks)
      .set({
        responseCount: sql`${guestTasks.responseCount} + 1`,
        status: sql`case when ${guestTasks.responseCount} + 1 >= ${guestTasks.maxResponses} then 'completed'::guest_task_status else ${guestTasks.status} end`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(guestTasks.id, task.id),
          eq(guestTasks.status, "open"),
          lt(guestTasks.responseCount, guestTasks.maxResponses),
          isNull(guestTasks.revokedAt),
        ),
      )
      .returning();
    if (!updatedTask) {
      throw new AgentApiError(409, "This request already has enough responses");
    }

    const [created] = await tx
      .insert(guestResponses)
      .values({
        guestTaskId: task.id,
        idempotencyKey,
        response: response.publicResponse,
        privateResponse: response.privateResponse ?? null,
        submitterEmailHash: emailHash,
        clientIpHash: hashGuestIp(opts.clientIp),
      })
      .returning();

    if (task.sessionId) {
      await tx.insert(sessionMessages).values({
        sessionId: task.sessionId,
        senderUserId: null,
        actorKind: "guest",
        kind: "guest.response",
        body: {
          text: "A guest responded to a private request.",
          guestTaskPublicId: task.publicId,
          response: response.publicResponse,
        },
      });
    }
    return { response: created, idempotent: false };
  });

  await writeAudit({
    actorUserId: opts.actor?.userId ?? null,
    actorApiKeyId: opts.actor?.apiKeyId ?? null,
    actorKind: opts.actor?.kind ?? "guest",
    action: "guest_task.responded",
    entityType: "guest_task",
    entityId: task.id,
    metadata: {
      publicId: task.publicId,
      organizerUserId: task.organizerUserId,
      responseId: result.response.id,
      idempotent: result.idempotent,
    },
  });

  if (task.taskType === "hiring_compatibility" && !result.idempotent) {
    await deliverHiringInbox({
      userId: task.organizerUserId,
      kind: "hiring.candidate_response",
      summary: `A candidate responded to ${task.title}`,
      body: {
        publicId: task.publicId,
        responseId: result.response.id,
        instructions:
          "Call read_guest_task to review approved expectations and alignment gaps. Do not contact the candidate outside the agreed channel.",
      },
      dedupeKey: `hiring:${task.id}:response:${result.response.id}`,
    }).catch((error) => {
      console.error(
        "[hiring] recruiter agent response notification failed",
        error,
      );
    });
  }

  return {
    ok: true,
    idempotent: result.idempotent,
    status: "received",
    responseId: result.response.id,
    ...(task.taskType === "hiring_compatibility"
      ? { alignment: result.response.response }
      : {}),
  };
}
