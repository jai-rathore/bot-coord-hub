import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const intentStatusEnum = pgEnum("intent_status", [
  "pending",
  "live",
  "rejected",
]);

export const linkStatusEnum = pgEnum("link_status", [
  "pending",
  "active",
  "revoked",
]);

export const sessionStatusEnum = pgEnum("session_status", [
  "open",
  "proposed",
  "accepted",
  "confirmed",
  "declined",
  "cancelled",
]);

export const confirmStatusEnum = pgEnum("confirm_status", [
  "pending",
  "approved",
  "denied",
]);

export const participantRoleEnum = pgEnum("participant_role", [
  "organizer",
  "invitee",
]);

export const guestTaskStatusEnum = pgEnum("guest_task_status", [
  "open",
  "completed",
  "expired",
  "revoked",
]);

export const guestTaskTypeEnum = pgEnum("guest_task_type", [
  "binary_choice",
  "text_response",
  "availability",
]);

export const pairingStatusEnum = pgEnum("pairing_status", [
  "pending",
  "approved",
  "denied",
  "consumed",
  "expired",
]);

/** Optional working-hours policy on a link. */
export type AllowedHours = {
  start: string;
  end: string;
  /** 0=Sun … 6=Sat; omit = all days */
  days?: number[];
};

export type SessionSlot = {
  start: string;
  end: string;
  timezone: string;
  rank?: number;
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("users_clerk_user_id_uidx").on(t.clerkUserId),
    uniqueIndex("users_email_uidx").on(t.email),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("api_keys_key_hash_uidx").on(t.keyHash),
    index("api_keys_user_id_idx").on(t.userId),
  ],
);

export const links = pgTable(
  "links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Optional target email; empty/null means open invite URL anyone signed-in can accept. */
    toEmail: text("to_email"),
    toName: text("to_name"),
    inviteCode: text("invite_code").notNull(),
    status: linkStatusEnum("status").notNull().default("pending"),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    /** Points at the reciprocal row once a link is mutual/active. */
    pairLinkId: uuid("pair_link_id"),
    /** When true, schedule_meeting waits for human confirms before booking. */
    confirmRequired: boolean("confirm_required").notNull().default(true),
    /** Optional IANA timezone for allowed_hours evaluation. */
    timezone: text("timezone"),
    /** Optional working-hours policy JSON. */
    allowedHours: jsonb("allowed_hours").$type<AllowedHours | null>(),
    /** Pending invites expire; active relationships do not. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("links_invite_code_uidx").on(t.inviteCode),
    index("links_from_user_id_idx").on(t.fromUserId),
    index("links_to_user_id_idx").on(t.toUserId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    intentType: text("intent_type").notNull(),
    initiatorUserId: uuid("initiator_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    peerUserId: uuid("peer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    linkId: uuid("link_id").references(() => links.id, {
      onDelete: "set null",
    }),
    status: sessionStatusEnum("status").notNull().default("open"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("sessions_initiator_user_id_idx").on(t.initiatorUserId),
    index("sessions_peer_user_id_idx").on(t.peerUserId),
    index("sessions_status_idx").on(t.status),
    uniqueIndex("sessions_initiator_idempotency_uidx")
      .on(t.initiatorUserId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
  ],
);

export const sessionParticipants = pgTable(
  "session_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: participantRoleEnum("role").notNull().default("invitee"),
    linkId: uuid("link_id").references(() => links.id, {
      onDelete: "set null",
    }),
    /** pending | offered | accepted | declined */
    voteStatus: text("vote_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("session_participants_session_user_uidx").on(
      t.sessionId,
      t.userId,
    ),
    index("session_participants_session_id_idx").on(t.sessionId),
    index("session_participants_user_id_idx").on(t.userId),
  ],
);

export const sessionMessages = pgTable(
  "session_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    senderUserId: uuid("sender_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorApiKeyId: uuid("actor_api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    actorKind: text("actor_kind").notNull().default("user"),
    kind: text("kind").notNull(),
    body: jsonb("body").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("session_messages_session_id_idx").on(t.sessionId)],
);

export const intentTypes = pgTable(
  "intent_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: intentStatusEnum("status").notNull().default("pending"),
    schema: jsonb("schema").$type<Record<string, unknown>>().default({}),
    category: text("category").notNull().default("coordination"),
    requiredScopes: jsonb("required_scopes").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("intent_types_slug_uidx").on(t.slug)],
);

export const triageRecommendationEnum = pgEnum("triage_recommendation", [
  "publish",
  "reject",
  "needs_review",
]);

export const intentProposals = pgTable(
  "intent_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull().default("coordination"),
    status: intentStatusEnum("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    proposedByUserId: uuid("proposed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    proposedByEmail: text("proposed_by_email"),
    /** Set on create — worker claims rows where triaged_at IS NULL. */
    triageQueuedAt: timestamp("triage_queued_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    triageRecommendation: triageRecommendationEnum("triage_recommendation"),
    triageReason: text("triage_reason"),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("intent_proposals_slug_uidx").on(t.slug),
    index("intent_proposals_status_idx").on(t.status),
    index("intent_proposals_triage_queue_idx").on(t.triageQueuedAt, t.triagedAt),
  ],
);

/** Append-only audit trail for consequential actions. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorApiKeyId: uuid("actor_api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    actorKind: text("actor_kind").notNull().default("user"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("audit_logs_actor_user_id_idx").on(t.actorUserId),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ],
);

/**
 * A no-account guest receives one scoped capability for one task.
 * Raw gt_ tokens are never persisted.
 */
export const guestTasks = pgTable(
  "guest_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicId: uuid("public_id").defaultRandom().notNull(),
    organizerUserId: uuid("organizer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskType: guestTaskTypeEnum("task_type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    targetEmailHash: text("target_email_hash"),
    status: guestTaskStatusEnum("status").notNull().default("open"),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    maxResponses: integer("max_responses").notNull().default(1),
    responseCount: integer("response_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("guest_tasks_public_id_uidx").on(t.publicId),
    uniqueIndex("guest_tasks_token_hash_uidx").on(t.tokenHash),
    index("guest_tasks_organizer_idx").on(t.organizerUserId),
    index("guest_tasks_status_expires_idx").on(t.status, t.expiresAt),
  ],
);

export const guestResponses = pgTable(
  "guest_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    guestTaskId: uuid("guest_task_id")
      .notNull()
      .references(() => guestTasks.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    response: jsonb("response").$type<Record<string, unknown>>().notNull(),
    submitterEmailHash: text("submitter_email_hash"),
    clientIpHash: text("client_ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("guest_responses_task_idempotency_uidx").on(
      t.guestTaskId,
      t.idempotencyKey,
    ),
    index("guest_responses_task_idx").on(t.guestTaskId),
  ],
);

/**
 * Short-lived device-style pairing. The human approves in Clerk; the agent
 * exchanges its secret exactly once for a scoped hm_ credential.
 */
export const agentPairings = pgTable(
  "agent_pairings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    deviceCodeHash: text("device_code_hash").notNull(),
    userCode: text("user_code").notNull(),
    agentName: text("agent_name").notNull(),
    requestedScopes: jsonb("requested_scopes").$type<string[]>().notNull().default([]),
    status: pairingStatusEnum("status").notNull().default("pending"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("agent_pairings_device_code_hash_uidx").on(t.deviceCodeHash),
    uniqueIndex("agent_pairings_user_code_uidx").on(t.userCode),
    index("agent_pairings_status_expires_idx").on(t.status, t.expiresAt),
    index("agent_pairings_user_id_idx").on(t.userId),
  ],
);

export const confirms = pgTable(
  "confirms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    note: text("note"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    status: confirmStatusEnum("status").notNull().default("pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("confirms_session_id_idx").on(t.sessionId),
    index("confirms_user_id_idx").on(t.userId),
    index("confirms_status_idx").on(t.status),
  ],
);

/** Per-user Google Calendar OAuth tokens (encrypted-at-rest optional later). */
export const calendarConnections = pgTable(
  "calendar_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("google"),
    googleAccountEmail: text("google_account_email"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scopes: text("scopes"),
    calendarId: text("calendar_id").notNull().default("primary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("calendar_connections_user_provider_uidx").on(
      t.userId,
      t.provider,
    ),
    index("calendar_connections_user_id_idx").on(t.userId),
  ],
);

export type User = typeof users.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Link = typeof links.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SessionMessage = typeof sessionMessages.$inferSelect;
export type SessionParticipant = typeof sessionParticipants.$inferSelect;
export type Confirm = typeof confirms.$inferSelect;
export type IntentType = typeof intentTypes.$inferSelect;
export type IntentProposal = typeof intentProposals.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type CalendarConnection = typeof calendarConnections.$inferSelect;
export type GuestTask = typeof guestTasks.$inferSelect;
export type GuestResponse = typeof guestResponses.$inferSelect;
export type AgentPairing = typeof agentPairings.$inferSelect;
