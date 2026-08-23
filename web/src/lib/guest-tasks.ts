import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  guestResponses,
  guestTasks,
  sessionMessages,
  type GuestTask,
  type User,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { AgentApiError } from "@/lib/agent-errors";
import { getSessionForUser } from "@/lib/sessions";
import {
  generateGuestToken,
  hashGuestEmail,
  hashGuestIp,
  hashGuestToken,
} from "@/lib/guest-tokens";
import {
  assertPayloadSize,
  assertUuid,
  boundedText,
  LIMITS,
} from "@/lib/validation";
import {
  matchHiringConstraints,
  type CandidateConstraints,
  type RoleConstraints,
} from "@/lib/hiring-match";
import { encryptSecret } from "@/lib/secret-crypto";

export type GuestTaskType =
  | "binary_choice"
  | "text_response"
  | "availability"
  | "hiring_compatibility";

export type GuestTaskActor = {
  apiKeyId?: string | null;
  kind?: "user" | "agent" | "hosted_agent";
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
      throw new AgentApiError(400, "Each choice must be 80 characters or fewer");
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
        "compensation",
        "location",
        "work mode",
        "sponsorship",
        "start timing",
        "level",
      ],
      privacy:
        "The organizer receives only the compatibility result, never your submitted values.",
    };
  }

  return {
    maxSlots: Math.min(
      Math.max(Number(config.maxSlots ?? 12), 1),
      LIMITS.guestSlots,
    ),
  };
}

function normalizeStringList(value: unknown, field: string): string[] | undefined {
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

function normalizeRoleConstraints(
  taskType: GuestTaskType,
  value: unknown,
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
  const latestStart =
    boundedText(input.latestStart, "latestStart", 40) ?? undefined;
  if (latestStart && Number.isNaN(new Date(latestStart).getTime())) {
    throw new AgentApiError(400, "latestStart must be a date");
  }
  const sponsorshipAvailable =
    typeof input.sponsorshipAvailable === "boolean"
      ? input.sponsorshipAvailable
      : undefined;
  return {
    ...(compensationMaximum == null ? {} : { compensationMaximum }),
    ...(normalizeStringList(input.locations, "locations")
      ? { locations: normalizeStringList(input.locations, "locations") }
      : {}),
    ...(normalizeStringList(input.workModes, "workModes")
      ? { workModes: normalizeStringList(input.workModes, "workModes") }
      : {}),
    ...(sponsorshipAvailable == null ? {} : { sponsorshipAvailable }),
    ...(latestStart ? { latestStart } : {}),
    ...(normalizeStringList(input.levels, "levels")
      ? { levels: normalizeStringList(input.levels, "levels") }
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
}) {
  const taskType = normalizeTaskType(opts.taskType);
  const title = boundedText(
    opts.title,
    "title",
    LIMITS.titleLength,
    { required: true },
  )!;
  const description =
    boundedText(
      opts.description,
      "description",
      LIMITS.descriptionLength,
    ) ?? null;
  const targetEmail = boundedText(
    opts.targetEmail,
    "targetEmail",
    320,
    { required: true },
  )!.toLowerCase();
  if (!targetEmail.includes("@")) {
    throw new AgentApiError(400, "targetEmail must be a valid email");
  }
  const config = normalizeConfig(taskType, opts.config);
  const privateConfig = normalizeRoleConstraints(
    taskType,
    opts.privateConfig,
  );
  const expiresInMinutes = Math.floor(Math.min(
    Math.max(Number(opts.expiresInMinutes ?? 7 * 24 * 60), 15),
    30 * 24 * 60,
  ));
  const maxResponses = Math.floor(Math.min(
    Math.max(Number(opts.maxResponses ?? 1), 1),
    20,
  ));
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
  const [created] = await db
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
      expiresAt: new Date(Date.now() + expiresInMinutes * 60_000),
      maxResponses,
    })
    .returning();

  await writeAudit({
    actorUserId: opts.organizer.id,
    actorApiKeyId: opts.actor?.apiKeyId ?? null,
    actorKind: opts.actor?.kind ?? "user",
    action: "guest_task.created",
    entityType: "guest_task",
    entityId: created.id,
    metadata: {
      publicId: created.publicId,
      taskType,
      expiresAt: created.expiresAt.toISOString(),
    },
  });

  const origin = opts.origin.replace(/\/$/, "");
  return {
    task: serializeTask(created),
    rawToken,
    guestUrl: `${origin}/guest/${created.publicId}#${rawToken}`,
    warning: "This private response link is shown once. Share it only with the recipient.",
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
    responses: responses.map((response) => ({
      ...response,
      createdAt: response.createdAt.toISOString(),
    })),
  };
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
    const earliestStart =
      boundedText(response.earliestStart, "earliestStart", 40) ?? undefined;
    if (earliestStart && Number.isNaN(new Date(earliestStart).getTime())) {
      throw new AgentApiError(400, "earliestStart must be a date");
    }
    const candidate: CandidateConstraints = {
      ...(compensationMinimum == null ? {} : { compensationMinimum }),
      ...(normalizeStringList(response.locations, "locations")
        ? { locations: normalizeStringList(response.locations, "locations") }
        : {}),
      ...(normalizeStringList(response.workModes, "workModes")
        ? { workModes: normalizeStringList(response.workModes, "workModes") }
        : {}),
      ...(typeof response.sponsorshipRequired === "boolean"
        ? { sponsorshipRequired: response.sponsorshipRequired }
        : {}),
      ...(earliestStart ? { earliestStart } : {}),
      ...(normalizeStringList(response.levels, "levels")
        ? { levels: normalizeStringList(response.levels, "levels") }
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
}) {
  const idempotencyKey = assertUuid(
    opts.idempotencyKey,
    "Idempotency-Key",
  );
  const email = boundedText(opts.email, "email", 320, {
    required: true,
  })!.toLowerCase();
  const task = await resolveGuestTask(opts.publicId, opts.rawToken);
  const emailHash = hashGuestEmail(email);
  if (task.targetEmailHash && task.targetEmailHash !== emailHash) {
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
    actorUserId: null,
    actorKind: "guest",
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

  return {
    ok: true,
    idempotent: result.idempotent,
    status: "received",
    responseId: result.response.id,
  };
}
