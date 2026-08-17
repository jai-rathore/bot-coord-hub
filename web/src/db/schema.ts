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
  check,
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
  "hiring_compatibility",
]);

export const pairingStatusEnum = pgEnum("pairing_status", [
  "pending",
  "approved",
  "denied",
  "consumed",
  "expired",
]);

export const publicInviteStatusEnum = pgEnum("public_invite_status", [
  "active",
  "revoked",
]);

export const discoveryEnrollmentStatusEnum = pgEnum(
  "discovery_enrollment_status",
  ["draft", "pending_approval", "active", "paused", "revoked"],
);

export const discoveryInterestStatusEnum = pgEnum(
  "discovery_interest_status",
  ["pending", "accepted", "declined", "withdrawn"],
);

export const userSafetyStatusEnum = pgEnum("user_safety_status", [
  "active",
  "restricted",
  "suspended",
]);

export const safetyReportStatusEnum = pgEnum("safety_report_status", [
  "open",
  "reviewed",
  "actioned",
  "dismissed",
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

/**
 * Stable public address for a human and their paired agent. Handles are
 * immutable in v1 so links shared on personal sites remain durable.
 */
export const agentProfiles = pgTable(
  "agent_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    headline: text("headline"),
    websiteUrl: text("website_url"),
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("agent_profiles_user_id_uidx").on(t.userId),
    uniqueIndex("agent_profiles_handle_uidx").on(sql`lower(${t.handle})`),
    check(
      "agent_profiles_handle_format_check",
      sql`${t.handle} = lower(${t.handle}) and ${t.handle} ~ '^[a-z][a-z0-9-]{2,29}$'`,
    ),
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
    /** Optional HTTPS endpoint HoneyMatcha POSTs when this agent has inbox work. */
    callbackUrl: text("callback_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("api_keys_key_hash_uidx").on(t.keyHash),
    index("api_keys_user_id_idx").on(t.userId),
  ],
);

/**
 * A reusable, signed share link. Redeeming one creates an approval-gated link
 * request; it never grants relationship permissions by itself.
 */
export const publicInvites = pgTable(
  "public_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label"),
    status: publicInviteStatusEnum("status").notNull().default("active"),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    confirmRequired: boolean("confirm_required").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    maxRedemptions: integer("max_redemptions").notNull().default(25),
    redemptionCount: integer("redemption_count").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("public_invites_owner_created_idx").on(
      t.ownerUserId,
      t.createdAt,
    ),
    index("public_invites_status_expires_idx").on(t.status, t.expiresAt),
    check(
      "public_invites_max_redemptions_check",
      sql`${t.maxRedemptions} between 1 and 100`,
    ),
    check(
      "public_invites_redemption_count_check",
      sql`${t.redemptionCount} between 0 and ${t.maxRedemptions}`,
    ),
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
    /** Source share link for approval-gated public connection requests. */
    publicInviteId: uuid("public_invite_id").references(() => publicInvites.id, {
      onDelete: "set null",
    }),
    /** Stable profile handle used for an approval-gated public request. */
    profileHandle: text("profile_handle"),
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
    index("links_public_invite_id_idx").on(t.publicInviteId),
    index("links_profile_handle_idx").on(t.profileHandle),
    uniqueIndex("links_public_invite_user_uidx").on(
      t.publicInviteId,
      t.toUserId,
    ),
    uniqueIndex("links_profile_handle_user_uidx").on(
      t.profileHandle,
      t.toUserId,
    ),
    check(
      "links_single_public_source_check",
      sql`not (${t.publicInviteId} is not null and ${t.profileHandle} is not null)`,
    ),
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
    definitionVersion: integer("definition_version").notNull().default(1),
    definition: jsonb("definition").$type<Record<string, unknown>>().default({}),
    discoveryEnabled: boolean("discovery_enabled").notNull().default(false),
    handler: text("handler").notNull().default("none"),
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

/**
 * Coarse, human-approved location. Exact coordinates are intentionally absent
 * from the first discovery release.
 */
export const userLocations = pgTable(
  "user_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    countryCode: text("country_code"),
    region: text("region"),
    locality: text("locality"),
    neighborhood: text("neighborhood"),
    granularity: text("granularity").notNull().default("city"),
    visibility: text("visibility").notNull().default("private_match"),
    privateValueEncrypted: text("private_value_encrypted"),
    isPrimary: boolean("is_primary").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("user_locations_user_id_idx").on(t.userId),
    check(
      "user_locations_granularity_check",
      sql`${t.granularity} in ('country', 'region', 'city', 'neighborhood')`,
    ),
    check(
      "user_locations_visibility_check",
      sql`${t.visibility} in ('private_match', 'disclose_after_match')`,
    ),
  ],
);

export const purposeEnrollments = pgTable(
  "purpose_enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    intentSlug: text("intent_slug").notNull(),
    definitionVersion: integer("definition_version").notNull(),
    status: discoveryEnrollmentStatusEnum("status")
      .notNull()
      .default("draft"),
    publicClaims: jsonb("public_claims")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    privateClaimsEncrypted: text("private_claims_encrypted"),
    disclosureClaims: jsonb("disclosure_claims")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    claimProvenance: jsonb("claim_provenance")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    locationId: uuid("location_id").references(() => userLocations.id, {
      onDelete: "set null",
    }),
    submittedByApiKeyId: uuid("submitted_by_api_key_id").references(
      () => apiKeys.id,
      { onDelete: "set null" },
    ),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("purpose_enrollments_user_intent_uidx").on(
      t.userId,
      t.intentSlug,
    ),
    index("purpose_enrollments_discovery_idx").on(
      t.intentSlug,
      t.status,
      t.expiresAt,
    ),
    index("purpose_enrollments_location_idx").on(t.locationId),
  ],
);

export const agentCapabilities = pgTable(
  "agent_capabilities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    supportedIntents: jsonb("supported_intents")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("agent_capabilities_api_key_uidx").on(t.apiKeyId),
  ],
);

/**
 * Search-scoped opaque handles. Raw dc_ tokens are returned once and only
 * their hashes are stored.
 */
export const discoveryHandles = pgTable(
  "discovery_handles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenHash: text("token_hash").notNull(),
    requesterUserId: uuid("requester_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requesterApiKeyId: uuid("requester_api_key_id").references(
      () => apiKeys.id,
      { onDelete: "cascade" },
    ),
    candidateUserId: uuid("candidate_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requesterEnrollmentId: uuid("requester_enrollment_id")
      .notNull()
      .references(() => purposeEnrollments.id, { onDelete: "cascade" }),
    candidateEnrollmentId: uuid("candidate_enrollment_id")
      .notNull()
      .references(() => purposeEnrollments.id, { onDelete: "cascade" }),
    intentSlug: text("intent_slug").notNull(),
    compatibility: jsonb("compatibility")
      .$type<Record<string, unknown>>()
      .notNull(),
    projection: jsonb("projection")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("discovery_handles_token_hash_uidx").on(t.tokenHash),
    index("discovery_handles_requester_expires_idx").on(
      t.requesterUserId,
      t.expiresAt,
    ),
    index("discovery_handles_candidate_idx").on(t.candidateUserId),
  ],
);

export const discoveryInterests = pgTable(
  "discovery_interests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    intentSlug: text("intent_slug").notNull(),
    requesterUserId: uuid("requester_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requesterEnrollmentId: uuid("requester_enrollment_id")
      .notNull()
      .references(() => purposeEnrollments.id, { onDelete: "cascade" }),
    recipientEnrollmentId: uuid("recipient_enrollment_id")
      .notNull()
      .references(() => purposeEnrollments.id, { onDelete: "cascade" }),
    /** Canonical sorted user-id pair; prevents reciprocal duplicate intros. */
    pairKey: text("pair_key"),
    status: discoveryInterestStatusEnum("status").notNull().default("pending"),
    compatibility: jsonb("compatibility")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    requesterConfirmedAt: timestamp("requester_confirmed_at", {
      withTimezone: true,
    }),
    requesterConfirmedByApiKeyId: uuid(
      "requester_confirmed_by_api_key_id",
    ).references(() => apiKeys.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("discovery_interests_pair_uidx").on(
      t.intentSlug,
      t.requesterUserId,
      t.recipientUserId,
    ),
    uniqueIndex("discovery_interests_canonical_pair_uidx")
      .on(t.intentSlug, t.pairKey)
      .where(sql`${t.pairKey} is not null`),
    uniqueIndex("discovery_interests_idempotency_uidx")
      .on(t.requesterUserId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index("discovery_interests_recipient_status_idx").on(
      t.recipientUserId,
      t.status,
      t.createdAt,
    ),
    index("discovery_interests_requester_idx").on(
      t.requesterUserId,
      t.createdAt,
    ),
  ],
);

export const discoveryDisclosures = pgTable(
  "discovery_disclosures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    interestId: uuid("interest_id")
      .notNull()
      .references(() => discoveryInterests.id, { onDelete: "cascade" }),
    grantorUserId: uuid("grantor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    granteeUserId: uuid("grantee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fields: jsonb("fields")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("discovery_disclosures_interest_grantor_uidx").on(
      t.interestId,
      t.grantorUserId,
    ),
    index("discovery_disclosures_grantee_idx").on(t.granteeUserId),
  ],
);

export const discoveryBlocks = pgTable(
  "discovery_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    blockerUserId: uuid("blocker_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedUserId: uuid("blocked_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reasonCode: text("reason_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("discovery_blocks_pair_uidx").on(
      t.blockerUserId,
      t.blockedUserId,
    ),
    index("discovery_blocks_blocked_idx").on(t.blockedUserId),
    check(
      "discovery_blocks_not_self_check",
      sql`${t.blockerUserId} <> ${t.blockedUserId}`,
    ),
  ],
);

/** Durable anti-probing memory that survives enrollment revocation/recreation. */
export const discoveryPairHistory = pgTable(
  "discovery_pair_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pairKey: text("pair_key").notNull(),
    userAId: uuid("user_a_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userBId: uuid("user_b_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    intentSlug: text("intent_slug").notNull(),
    outcome: text("outcome").notNull(),
    probeCount: integer("probe_count").notNull().default(1),
    lastOutcomeAt: timestamp("last_outcome_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("discovery_pair_history_intent_pair_uidx").on(
      t.intentSlug,
      t.pairKey,
    ),
    index("discovery_pair_history_user_a_idx").on(t.userAId, t.intentSlug),
    index("discovery_pair_history_user_b_idx").on(t.userBId, t.intentSlug),
    check(
      "discovery_pair_history_not_self_check",
      sql`${t.userAId} <> ${t.userBId}`,
    ),
  ],
);

export const userSafety = pgTable(
  "user_safety",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: userSafetyStatusEnum("status").notNull().default("active"),
    reasonCode: text("reason_code"),
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
  (t) => [uniqueIndex("user_safety_user_uidx").on(t.userId)],
);

export const safetyReports = pgTable(
  "safety_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reporterUserId: uuid("reporter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectUserId: uuid("subject_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    interestId: uuid("interest_id").references(() => discoveryInterests.id, {
      onDelete: "set null",
    }),
    reasonCode: text("reason_code").notNull(),
    details: text("details"),
    status: safetyReportStatusEnum("status").notNull().default("open"),
    moderatorNotes: text("moderator_notes"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("safety_reports_subject_status_idx").on(
      t.subjectUserId,
      t.status,
      t.createdAt,
    ),
    index("safety_reports_reporter_idx").on(t.reporterUserId, t.createdAt),
    uniqueIndex("safety_reports_reporter_interest_uidx")
      .on(t.reporterUserId, t.interestId)
      .where(sql`${t.interestId} is not null`),
    check(
      "safety_reports_not_self_check",
      sql`${t.reporterUserId} <> ${t.subjectUserId}`,
    ),
  ],
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
    privateConfig: jsonb("private_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
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
    privateResponse: text("private_response"),
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

/**
 * MCP OAuth 2.1 clients (Dynamic Client Registration). Public clients use
 * token_endpoint_auth_method=none and PKCE S256.
 */
export const oauthClients = pgTable(
  "oauth_clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: text("client_id").notNull(),
    clientName: text("client_name"),
    redirectUris: jsonb("redirect_uris").$type<string[]>().notNull().default([]),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method")
      .notNull()
      .default("none"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("oauth_clients_client_id_uidx").on(t.clientId)],
);

/** Single-use authorization codes for MCP OAuth authorization_code + PKCE. */
export const oauthAuthorizationCodes = pgTable(
  "oauth_authorization_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    codeHash: text("code_hash").notNull(),
    clientId: text("client_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: text("code_challenge_method").notNull().default("S256"),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    agentName: text("agent_name").notNull().default("MCP Agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("oauth_authorization_codes_code_hash_uidx").on(t.codeHash),
    index("oauth_authorization_codes_client_id_idx").on(t.clientId),
    index("oauth_authorization_codes_user_id_idx").on(t.userId),
  ],
);

/** Refresh tokens that mint/rotate scoped hm_ access credentials. */
export const oauthRefreshTokens = pgTable(
  "oauth_refresh_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenHash: text("token_hash").notNull(),
    clientId: text("client_id").notNull(),
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("oauth_refresh_tokens_token_hash_uidx").on(t.tokenHash),
    index("oauth_refresh_tokens_client_id_idx").on(t.clientId),
    index("oauth_refresh_tokens_api_key_id_idx").on(t.apiKeyId),
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

/**
 * Work for a person's paired agent. HoneyMatcha writes here when another
 * agent starts coordination. Agents poll get_inbox / whoami; optional
 * callbackUrl on the API key gets a POST.
 */
export const agentInbox = pgTable(
  "agent_inbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "cascade",
    }),
    discoveryInterestId: uuid("discovery_interest_id").references(
      () => discoveryInterests.id,
      { onDelete: "cascade" },
    ),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    body: jsonb("body").$type<Record<string, unknown>>().notNull().default({}),
    ackedAt: timestamp("acked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("agent_inbox_user_created_idx").on(t.userId, t.createdAt),
    index("agent_inbox_user_unacked_idx").on(t.userId, t.ackedAt),
    index("agent_inbox_session_kind_idx").on(t.sessionId, t.kind),
    index("agent_inbox_discovery_interest_idx").on(t.discoveryInterestId),
  ],
);

export type User = typeof users.$inferSelect;
export type AgentProfile = typeof agentProfiles.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type PublicInvite = typeof publicInvites.$inferSelect;
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
export type OAuthClient = typeof oauthClients.$inferSelect;
export type OAuthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;
export type OAuthRefreshToken = typeof oauthRefreshTokens.$inferSelect;
export type AgentInbox = typeof agentInbox.$inferSelect;
export type UserLocation = typeof userLocations.$inferSelect;
export type PurposeEnrollment = typeof purposeEnrollments.$inferSelect;
export type AgentCapability = typeof agentCapabilities.$inferSelect;
export type DiscoveryHandle = typeof discoveryHandles.$inferSelect;
export type DiscoveryInterest = typeof discoveryInterests.$inferSelect;
export type DiscoveryDisclosure = typeof discoveryDisclosures.$inferSelect;
export type DiscoveryBlock = typeof discoveryBlocks.$inferSelect;
export type DiscoveryPairHistory = typeof discoveryPairHistory.$inferSelect;
export type UserSafety = typeof userSafety.$inferSelect;
export type SafetyReport = typeof safetyReports.$inferSelect;
