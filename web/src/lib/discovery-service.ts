import { createHash, randomBytes } from "crypto";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  agentCapabilities,
  auditLogs,
  discoveryBlocks,
  discoveryDisclosures,
  discoveryHandles,
  discoveryInterests,
  intentTypes,
  purposeEnrollments,
  safetyReports,
  sessions,
  userLocations,
  userSafety,
  users,
  type PurposeEnrollment,
  type User,
} from "@/db/schema";
import { AgentApiError } from "@/lib/agent-errors";
import { deliverDiscoveryInbox } from "@/lib/agent-inbox";
import { writeAudit } from "@/lib/audit";
import {
  fieldMap,
  missingEnrollmentFields,
  validateIntentDefinition,
  type IntentDefinition,
  type IntentFieldDefinition,
  type LocationGranularity,
} from "@/lib/intent-contract";
import { registeredIntentHandler } from "@/lib/discovery-match";
import { decryptJson, encryptJson } from "@/lib/secret-crypto";
import { boundedText } from "@/lib/validation";

const DISCOVERY_TOKEN_PREFIX = "dc_";
const DISCOVERY_AUDIT_ACTIONS = [
  "discovery.enrollment_submitted",
  "discovery.enrollment_decided",
  "discovery.search",
  "discovery.interest_requested",
  "discovery.interest_decided",
  "discovery.disclosure_granted",
  "discovery.blocked",
  "discovery.reported",
  "discovery.safety_status_changed",
] as const;

export type DiscoveryActor = {
  user: User;
  kind: "user" | "agent";
  apiKeyId?: string | null;
};

export type CoarseLocationInput = {
  label?: unknown;
  countryCode?: unknown;
  region?: unknown;
  locality?: unknown;
  neighborhood?: unknown;
  granularity?: unknown;
  visibility?: unknown;
};

export type EnrollmentSubmission = {
  intentSlug?: unknown;
  claims?: unknown;
  provenance?: unknown;
  location?: CoarseLocationInput | null;
  requestActivation?: unknown;
};

function recordValue(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentApiError(400, `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  return recordValue(value, label);
}

function normalizedText(
  value: unknown,
  label: string,
  maximum = 160,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  return boundedText(value, label, maximum) ?? null;
}

function validateClaimValue(field: IntentFieldDefinition, value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  switch (field.type) {
    case "text":
      return normalizedText(value, field.key, 2_000);
    case "string_list": {
      if (!Array.isArray(value) || value.length > 30) {
        throw new AgentApiError(
          400,
          `${field.key} must be an array with at most 30 values`,
        );
      }
      const values = value.map((item, index) => {
        const text = normalizedText(item, `${field.key}[${index}]`, 160);
        if (!text) {
          throw new AgentApiError(400, `${field.key} cannot contain empty values`);
        }
        return text;
      });
      return [...new Set(values)];
    }
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new AgentApiError(400, `${field.key} must be a finite number`);
      }
      return value;
    case "boolean":
      if (typeof value !== "boolean") {
        throw new AgentApiError(400, `${field.key} must be boolean`);
      }
      return value;
    case "date": {
      if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
        throw new AgentApiError(400, `${field.key} must be an ISO date`);
      }
      return value;
    }
    case "enum": {
      if (typeof value !== "string" || !field.options?.includes(value)) {
        throw new AgentApiError(
          400,
          `${field.key} must be one of: ${(field.options ?? []).join(", ")}`,
        );
      }
      return value;
    }
  }
}

async function getDiscoveryIntent(slug: string) {
  const [row] = await getDb()
    .select()
    .from(intentTypes)
    .where(and(eq(intentTypes.slug, slug), eq(intentTypes.status, "live")))
    .limit(1);
  if (!row) {
    throw new AgentApiError(404, "Discovery intent not found", {
      code: "intent_not_found",
    });
  }
  let definition: IntentDefinition;
  try {
    definition = validateIntentDefinition(row.definition);
  } catch {
    throw new AgentApiError(503, "Discovery intent definition is invalid", {
      code: "invalid_intent_definition",
    });
  }
  if (!row.discoveryEnabled || !definition.discovery.enabled) {
    throw new AgentApiError(409, "This intent is not enabled for discovery", {
      code: "discovery_disabled",
    });
  }
  registeredIntentHandler(definition);
  return { row, definition };
}

function safeEnrollmentView(
  enrollment: PurposeEnrollment | undefined,
  definition: IntentDefinition,
) {
  const publicClaims =
    (enrollment?.publicClaims as Record<string, unknown> | undefined) ?? {};
  const disclosureClaims =
    (enrollment?.disclosureClaims as Record<string, unknown> | undefined) ?? {};
  const combined = { ...publicClaims, ...disclosureClaims };
  return {
    id: enrollment?.id ?? null,
    status: enrollment?.status ?? "not_enrolled",
    definitionVersion: enrollment?.definitionVersion ?? definition.version,
    publicClaims,
    disclosureClaims,
    missingFields: missingEnrollmentFields(definition, {
      ...combined,
      ...(enrollment ? decryptJson(enrollment.privateClaimsEncrypted) : {}),
    }).map((field) => field.key),
    consentedAt: enrollment?.consentedAt?.toISOString() ?? null,
    expiresAt: enrollment?.expiresAt?.toISOString() ?? null,
    locationId: enrollment?.locationId ?? null,
  };
}

export async function listDiscoveryCatalog(userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(intentTypes)
    .where(
      and(
        eq(intentTypes.status, "live"),
        eq(intentTypes.discoveryEnabled, true),
      ),
    );
  const enrollments = await db
    .select()
    .from(purposeEnrollments)
    .where(eq(purposeEnrollments.userId, userId));
  const bySlug = new Map(
    enrollments.map((enrollment) => [enrollment.intentSlug, enrollment]),
  );
  return rows.flatMap((row) => {
    try {
      const definition = validateIntentDefinition(row.definition);
      registeredIntentHandler(definition);
      return [
        {
          slug: row.slug,
          name: row.name,
          description: row.description,
          category: row.category,
          definitionVersion: definition.version,
          agentPrompt: definition.agentPrompt,
          enrollment: {
            summary: definition.enrollment.summary,
            questions: definition.enrollment.fields.map((field) => ({
              key: field.key,
              prompt: field.prompt,
              description: field.description ?? null,
              type: field.type,
              required: field.required,
              sensitivity: field.sensitivity,
              sourcePolicy: field.sourcePolicy,
              options: field.options ?? null,
              retentionDays: field.retentionDays,
            })),
          },
          discovery: {
            locationGranularity: definition.discovery.locationGranularity,
            pageLimit: definition.discovery.pageLimit,
          },
          currentEnrollment: safeEnrollmentView(
            bySlug.get(row.slug),
            definition,
          ),
        },
      ];
    } catch {
      return [];
    }
  });
}

export async function upsertAgentCapabilityManifest(opts: {
  apiKeyId: string;
  supportedIntents?: unknown;
  platforms?: unknown;
  metadata?: unknown;
}) {
  const supportedInput = optionalRecord(
    opts.supportedIntents,
    "supportedIntents",
  );
  const supportedIntents: Record<string, number> = {};
  for (const [slug, version] of Object.entries(supportedInput)) {
    if (
      !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(slug) ||
      typeof version !== "number" ||
      !Number.isInteger(version) ||
      version < 1
    ) {
      throw new AgentApiError(
        400,
        "supportedIntents must map valid slugs to positive integer versions",
      );
    }
    supportedIntents[slug] = version;
  }
  const platforms = Array.isArray(opts.platforms)
    ? [
        ...new Set(
          opts.platforms.map((value, index) => {
            const text = normalizedText(value, `platforms[${index}]`, 80);
            if (!text) throw new AgentApiError(400, "platform cannot be empty");
            return text;
          }),
        ),
      ].slice(0, 20)
    : [];
  const metadata = optionalRecord(opts.metadata, "metadata");
  if (JSON.stringify(metadata).length > 4_096) {
    throw new AgentApiError(400, "metadata is too large");
  }
  const [manifest] = await getDb()
    .insert(agentCapabilities)
    .values({
      apiKeyId: opts.apiKeyId,
      supportedIntents,
      platforms,
      metadata,
    })
    .onConflictDoUpdate({
      target: agentCapabilities.apiKeyId,
      set: { supportedIntents, platforms, metadata, updatedAt: new Date() },
    })
    .returning();
  return manifest;
}

export async function getAgentCapabilityManifest(apiKeyId: string) {
  const [manifest] = await getDb()
    .select()
    .from(agentCapabilities)
    .where(eq(agentCapabilities.apiKeyId, apiKeyId))
    .limit(1);
  return manifest ?? null;
}

function locationFieldsForGranularity(granularity: LocationGranularity) {
  switch (granularity) {
    case "country":
      return ["countryCode"] as const;
    case "region":
      return ["countryCode", "region"] as const;
    case "city":
      return ["countryCode", "region", "locality"] as const;
    case "neighborhood":
      return ["countryCode", "region", "locality", "neighborhood"] as const;
    case "none":
      return [] as const;
  }
}

async function upsertCoarseLocation(
  userId: string,
  input: CoarseLocationInput,
  requiredGranularity: LocationGranularity,
) {
  if (requiredGranularity === "none") return null;
  const granularity = normalizedText(input.granularity, "granularity", 20);
  const allowed: LocationGranularity[] = [
    "country",
    "region",
    "city",
    "neighborhood",
  ];
  if (!granularity || !allowed.includes(granularity as LocationGranularity)) {
    throw new AgentApiError(
      400,
      `granularity must be one of: ${allowed.join(", ")}`,
    );
  }
  const location = {
    label: normalizedText(input.label, "location.label", 160),
    countryCode: normalizedText(input.countryCode, "location.countryCode", 2),
    region: normalizedText(input.region, "location.region", 120),
    locality: normalizedText(input.locality, "location.locality", 120),
    neighborhood: normalizedText(
      input.neighborhood,
      "location.neighborhood",
      120,
    ),
    granularity: granularity as LocationGranularity,
    visibility:
      normalizedText(input.visibility, "location.visibility", 40) ??
      "private_match",
  };
  if (
    !["private_match", "disclose_after_match"].includes(location.visibility)
  ) {
    throw new AgentApiError(
      400,
      "location.visibility must be private_match or disclose_after_match",
    );
  }
  const required = locationFieldsForGranularity(location.granularity);
  const missing = required.filter((key) => !location[key]);
  if (missing.length || !location.label) {
    throw new AgentApiError(
      400,
      `Location is missing: ${["label", ...missing].join(", ")}`,
    );
  }
  const db = getDb();
  const [existing] = await db
    .select()
    .from(userLocations)
    .where(
      and(eq(userLocations.userId, userId), eq(userLocations.isPrimary, true)),
    )
    .limit(1);
  if (existing) {
    const [updated] = await db
      .update(userLocations)
      .set({ ...location, label: location.label!, updatedAt: new Date() })
      .where(eq(userLocations.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(userLocations)
    .values({ userId, ...location, label: location.label! })
    .returning();
  return created;
}

function mergeClaimsForSubmission(opts: {
  definition: IntentDefinition;
  existing?: PurposeEnrollment;
  claims: Record<string, unknown>;
  provenance: Record<string, unknown>;
  actorKind: DiscoveryActor["kind"];
}) {
  const fields = fieldMap(opts.definition);
  const unknown = Object.keys(opts.claims).filter((key) => !fields.has(key));
  if (unknown.length) {
    throw new AgentApiError(400, `Unknown enrollment fields: ${unknown.join(", ")}`);
  }
  const publicClaims = {
    ...((opts.existing?.publicClaims as Record<string, unknown>) ?? {}),
  };
  const privateClaims = opts.existing
    ? decryptJson(opts.existing.privateClaimsEncrypted)
    : {};
  const disclosureClaims = {
    ...((opts.existing?.disclosureClaims as Record<string, unknown>) ?? {}),
  };
  const claimProvenance = {
    ...((opts.existing?.claimProvenance as Record<string, unknown>) ?? {}),
  };
  const now = new Date().toISOString();

  for (const [key, rawValue] of Object.entries(opts.claims)) {
    const field = fields.get(key)!;
    if (opts.actorKind === "agent" && field.sourcePolicy === "human_only") {
      throw new AgentApiError(
        403,
        `${key} must be supplied directly by the human`,
        { code: "human_only_field", field: key },
      );
    }
    const value = validateClaimValue(field, rawValue);
    const target =
      field.sensitivity === "discoverable"
        ? publicClaims
        : field.sensitivity === "private"
          ? privateClaims
          : disclosureClaims;
    if (value === undefined) delete target[key];
    else target[key] = value;

    const provided = opts.provenance[key];
    if (
      opts.actorKind === "agent" &&
      (!provided || typeof provided !== "object" || Array.isArray(provided))
    ) {
      throw new AgentApiError(
        400,
        `provenance.${key} is required for agent-submitted information`,
      );
    }
    claimProvenance[key] = {
      source:
        provided &&
        typeof provided === "object" &&
        !Array.isArray(provided) &&
        typeof (provided as Record<string, unknown>).source === "string"
          ? String((provided as Record<string, unknown>).source).slice(0, 120)
          : opts.actorKind === "user"
            ? "human"
            : "agent",
      submittedBy: opts.actorKind,
      approvedByHuman: opts.actorKind === "user",
      recordedAt: now,
      expiresAt: new Date(
        Date.now() + field.retentionDays * 24 * 60 * 60 * 1000,
      ).toISOString(),
    };
  }
  return {
    publicClaims,
    privateClaims,
    disclosureClaims,
    claimProvenance,
    combined: { ...publicClaims, ...privateClaims, ...disclosureClaims },
  };
}

function earliestProvenanceExpiry(
  provenance: Record<string, unknown>,
): Date {
  const expiries = Object.values(provenance)
    .map((value) =>
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as Record<string, unknown>).expiresAt === "string"
        ? new Date(String((value as Record<string, unknown>).expiresAt))
        : null,
    )
    .filter((value): value is Date => Boolean(value && !Number.isNaN(value.getTime())));
  return expiries.length
    ? new Date(Math.min(...expiries.map((value) => value.getTime())))
    : new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
}

export async function submitDiscoveryEnrollment(
  actor: DiscoveryActor,
  submission: EnrollmentSubmission,
) {
  const intentSlug = normalizedText(submission.intentSlug, "intentSlug", 80);
  if (!intentSlug) throw new AgentApiError(400, "intentSlug is required");
  const { definition } = await getDiscoveryIntent(intentSlug);
  const claims = optionalRecord(submission.claims, "claims");
  const provenance = optionalRecord(submission.provenance, "provenance");
  const db = getDb();
  const [existing] = await db
    .select()
    .from(purposeEnrollments)
    .where(
      and(
        eq(purposeEnrollments.userId, actor.user.id),
        eq(purposeEnrollments.intentSlug, intentSlug),
      ),
    )
    .limit(1);
  const merged = mergeClaimsForSubmission({
    definition,
    existing,
    claims,
    provenance,
    actorKind: actor.kind,
  });
  const missing = missingEnrollmentFields(definition, merged.combined);
  const activationRequested = submission.requestActivation === true;
  if (activationRequested && missing.length) {
    throw new AgentApiError(400, "Enrollment is incomplete", {
      code: "missing_enrollment_fields",
      missingFields: missing.map((field) => field.key),
    });
  }
  const location =
    submission.location === undefined
      ? null
      : submission.location === null
        ? null
        : await upsertCoarseLocation(
            actor.user.id,
            submission.location,
            definition.discovery.locationGranularity,
          );
  const status =
    activationRequested && actor.kind === "user"
      ? ("active" as const)
      : activationRequested
        ? ("pending_approval" as const)
        : existing?.status === "active"
          ? ("pending_approval" as const)
          : ("draft" as const);
  const values = {
    definitionVersion: definition.version,
    status,
    publicClaims: merged.publicClaims,
    privateClaimsEncrypted: encryptJson(merged.privateClaims),
    disclosureClaims: merged.disclosureClaims,
    claimProvenance: merged.claimProvenance,
    locationId: location?.id ?? existing?.locationId ?? null,
    submittedByApiKeyId: actor.apiKeyId ?? null,
    consentedAt: status === "active" ? new Date() : null,
    expiresAt: earliestProvenanceExpiry(merged.claimProvenance),
    updatedAt: new Date(),
  };
  const [enrollment] = existing
    ? await db
        .update(purposeEnrollments)
        .set(values)
        .where(eq(purposeEnrollments.id, existing.id))
        .returning()
    : await db
        .insert(purposeEnrollments)
        .values({
          userId: actor.user.id,
          intentSlug,
          ...values,
        })
        .returning();
  await writeAudit({
    actorUserId: actor.user.id,
    actorApiKeyId: actor.apiKeyId,
    actorKind: actor.kind,
    action: "discovery.enrollment_submitted",
    entityType: "purpose_enrollment",
    entityId: enrollment.id,
    metadata: {
      intentSlug,
      status,
      submittedFields: Object.keys(claims),
      locationGranularity: location?.granularity ?? null,
    },
  });
  return {
    ...safeEnrollmentView(enrollment, definition),
    approvalRequired: status === "pending_approval",
    message:
      status === "active"
        ? "Discovery enrollment is active."
        : status === "pending_approval"
          ? "The human must approve this enrollment before discovery begins."
          : "Enrollment draft saved.",
  };
}

export async function decideDiscoveryEnrollment(opts: {
  user: User;
  enrollmentId: string;
  decision: "approve" | "pause" | "revoke";
}) {
  const db = getDb();
  const [enrollment] = await db
    .select()
    .from(purposeEnrollments)
    .where(
      and(
        eq(purposeEnrollments.id, opts.enrollmentId),
        eq(purposeEnrollments.userId, opts.user.id),
      ),
    )
    .limit(1);
  if (!enrollment) throw new AgentApiError(404, "Enrollment not found");
  const { definition } = await getDiscoveryIntent(enrollment.intentSlug);
  if (opts.decision === "approve") {
    const combined = {
      ...(enrollment.publicClaims as Record<string, unknown>),
      ...decryptJson(enrollment.privateClaimsEncrypted),
      ...(enrollment.disclosureClaims as Record<string, unknown>),
    };
    const missing = missingEnrollmentFields(definition, combined);
    if (missing.length) {
      throw new AgentApiError(400, "Enrollment is incomplete", {
        missingFields: missing.map((field) => field.key),
      });
    }
    const provenance = {
      ...(enrollment.claimProvenance as Record<string, unknown>),
    };
    for (const value of Object.values(provenance)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        (value as Record<string, unknown>).approvedByHuman = true;
        (value as Record<string, unknown>).approvedAt =
          new Date().toISOString();
      }
    }
    const [updated] = await db
      .update(purposeEnrollments)
      .set({
        status: "active",
        claimProvenance: provenance,
        consentedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(purposeEnrollments.id, enrollment.id))
      .returning();
    await writeAudit({
      actorUserId: opts.user.id,
      action: "discovery.enrollment_decided",
      entityType: "purpose_enrollment",
      entityId: enrollment.id,
      metadata: { decision: "approve", intentSlug: enrollment.intentSlug },
    });
    return safeEnrollmentView(updated, definition);
  }
  const status = opts.decision === "pause" ? "paused" : "revoked";
  const [updated] = await db
    .update(purposeEnrollments)
    .set({ status, updatedAt: new Date() })
    .where(eq(purposeEnrollments.id, enrollment.id))
    .returning();
  await writeAudit({
    actorUserId: opts.user.id,
    action: "discovery.enrollment_decided",
    entityType: "purpose_enrollment",
    entityId: enrollment.id,
    metadata: { decision: opts.decision, intentSlug: enrollment.intentSlug },
  });
  return safeEnrollmentView(updated, definition);
}

async function assertSafetyActive(userId: string) {
  const [safety] = await getDb()
    .select()
    .from(userSafety)
    .where(eq(userSafety.userId, userId))
    .limit(1);
  if (safety && safety.status !== "active") {
    throw new AgentApiError(403, "Discovery access is restricted", {
      code: "discovery_restricted",
    });
  }
}

async function blockedUserIds(userId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select()
    .from(discoveryBlocks)
    .where(
      or(
        eq(discoveryBlocks.blockerUserId, userId),
        eq(discoveryBlocks.blockedUserId, userId),
      ),
    );
  return new Set(
    rows.map((row) =>
      row.blockerUserId === userId ? row.blockedUserId : row.blockerUserId,
    ),
  );
}

function hashDiscoveryToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createDiscoveryToken() {
  return `${DISCOVERY_TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
}

async function activeEnrollment(userId: string, intentSlug: string) {
  const [enrollment] = await getDb()
    .select()
    .from(purposeEnrollments)
    .where(
      and(
        eq(purposeEnrollments.userId, userId),
        eq(purposeEnrollments.intentSlug, intentSlug),
        eq(purposeEnrollments.status, "active"),
        or(
          isNull(purposeEnrollments.expiresAt),
          gt(purposeEnrollments.expiresAt, new Date()),
        ),
      ),
    )
    .limit(1);
  if (!enrollment) {
    throw new AgentApiError(
      409,
      "An active, human-approved enrollment is required",
      { code: "active_enrollment_required", intentSlug },
    );
  }
  return enrollment;
}

export async function searchDiscovery(opts: {
  actor: DiscoveryActor;
  intentSlug: string;
  limit?: number;
}) {
  await assertSafetyActive(opts.actor.user.id);
  const { definition } = await getDiscoveryIntent(opts.intentSlug);
  const seeker = await activeEnrollment(
    opts.actor.user.id,
    opts.intentSlug,
  );
  const blocked = await blockedUserIds(opts.actor.user.id);
  const limit = Math.min(
    Math.max(Math.floor(opts.limit ?? definition.discovery.pageLimit), 1),
    definition.discovery.pageLimit,
  );
  const db = getDb();
  const candidates = await db
    .select({
      enrollment: purposeEnrollments,
      location: userLocations,
      safetyStatus: userSafety.status,
    })
    .from(purposeEnrollments)
    .leftJoin(
      userLocations,
      eq(purposeEnrollments.locationId, userLocations.id),
    )
    .leftJoin(userSafety, eq(purposeEnrollments.userId, userSafety.userId))
    .where(
      and(
        eq(purposeEnrollments.intentSlug, opts.intentSlug),
        eq(purposeEnrollments.status, "active"),
        ne(purposeEnrollments.userId, opts.actor.user.id),
        or(
          isNull(purposeEnrollments.expiresAt),
          gt(purposeEnrollments.expiresAt, new Date()),
        ),
      ),
    )
    .orderBy(desc(purposeEnrollments.updatedAt))
    .limit(100);
  const [seekerLocation] = seeker.locationId
    ? await db
        .select()
        .from(userLocations)
        .where(eq(userLocations.id, seeker.locationId))
        .limit(1)
    : [];
  const seekerClaims = {
    ...(seeker.publicClaims as Record<string, unknown>),
    ...decryptJson(seeker.privateClaimsEncrypted),
  };
  const handler = registeredIntentHandler(definition);
  const results: Array<{
    candidateHandle: string;
    compatibility: Record<string, unknown>;
    projection: Record<string, unknown>;
    expiresAt: string;
  }> = [];
  for (const candidate of candidates) {
    if (
      blocked.has(candidate.enrollment.userId) ||
      (candidate.safetyStatus && candidate.safetyStatus !== "active")
    ) {
      continue;
    }
    const candidateClaims = {
      ...(candidate.enrollment.publicClaims as Record<string, unknown>),
      ...decryptJson(candidate.enrollment.privateClaimsEncrypted),
    };
    const compatibility = handler({
      seekerClaims,
      candidateClaims,
      seekerLocation,
      candidateLocation: candidate.location,
    });
    if (compatibility.verdict === "incompatible") continue;
    const projection: Record<string, unknown> = {};
    for (const key of definition.discovery.projectionFields) {
      const value = (
        candidate.enrollment.publicClaims as Record<string, unknown>
      )[key];
      if (value !== undefined) projection[key] = value;
    }
    const token = createDiscoveryToken();
    const expiresAt = new Date(
      Date.now() + definition.discovery.handleTtlMinutes * 60_000,
    );
    await db.insert(discoveryHandles).values({
      tokenHash: hashDiscoveryToken(token),
      requesterUserId: opts.actor.user.id,
      candidateUserId: candidate.enrollment.userId,
      requesterEnrollmentId: seeker.id,
      candidateEnrollmentId: candidate.enrollment.id,
      intentSlug: opts.intentSlug,
      compatibility,
      projection,
      expiresAt,
    });
    results.push({
      candidateHandle: token,
      compatibility,
      projection,
      expiresAt: expiresAt.toISOString(),
    });
    if (results.length >= limit) break;
  }
  await writeAudit({
    actorUserId: opts.actor.user.id,
    actorApiKeyId: opts.actor.apiKeyId,
    actorKind: opts.actor.kind,
    action: "discovery.search",
    entityType: "intent_type",
    entityId: opts.intentSlug,
    metadata: { returned: results.length },
  });
  return {
    intentSlug: opts.intentSlug,
    candidates: results,
    hasMore: candidates.length > results.length && results.length === limit,
    privacy:
      "Results are pseudonymous and search-scoped. No stable user identifier, contact information, raw private claim, or exact result count is returned.",
  };
}

async function assertNotBlocked(leftUserId: string, rightUserId: string) {
  const [block] = await getDb()
    .select()
    .from(discoveryBlocks)
    .where(
      or(
        and(
          eq(discoveryBlocks.blockerUserId, leftUserId),
          eq(discoveryBlocks.blockedUserId, rightUserId),
        ),
        and(
          eq(discoveryBlocks.blockerUserId, rightUserId),
          eq(discoveryBlocks.blockedUserId, leftUserId),
        ),
      ),
    )
    .limit(1);
  if (block) {
    throw new AgentApiError(404, "Candidate is no longer available");
  }
}

export async function requestDiscoveryIntroduction(opts: {
  actor: DiscoveryActor;
  candidateHandle: string;
  idempotencyKey?: string;
}) {
  await assertSafetyActive(opts.actor.user.id);
  if (!/^dc_[A-Za-z0-9_-]{32,}$/.test(opts.candidateHandle)) {
    throw new AgentApiError(400, "Invalid candidate handle");
  }
  const db = getDb();
  const [handle] = await db
    .select()
    .from(discoveryHandles)
    .where(
      and(
        eq(discoveryHandles.tokenHash, hashDiscoveryToken(opts.candidateHandle)),
        eq(discoveryHandles.requesterUserId, opts.actor.user.id),
        gt(discoveryHandles.expiresAt, new Date()),
        isNull(discoveryHandles.usedAt),
      ),
    )
    .limit(1);
  if (!handle) {
    throw new AgentApiError(404, "Candidate handle is expired or unavailable");
  }
  await assertSafetyActive(handle.candidateUserId);
  await assertNotBlocked(opts.actor.user.id, handle.candidateUserId);
  await activeEnrollment(opts.actor.user.id, handle.intentSlug);
  await activeEnrollment(handle.candidateUserId, handle.intentSlug);
  const [existing] = await db
    .select()
    .from(discoveryInterests)
    .where(
      and(
        eq(discoveryInterests.intentSlug, handle.intentSlug),
        eq(discoveryInterests.requesterUserId, opts.actor.user.id),
        eq(discoveryInterests.recipientUserId, handle.candidateUserId),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      interestId: existing.id,
      status: existing.status,
      message: "An introduction request already exists for this candidate.",
    };
  }
  const [interest] = await db
    .insert(discoveryInterests)
    .values({
      intentSlug: handle.intentSlug,
      requesterUserId: opts.actor.user.id,
      recipientUserId: handle.candidateUserId,
      requesterEnrollmentId: handle.requesterEnrollmentId,
      recipientEnrollmentId: handle.candidateEnrollmentId,
      compatibility: handle.compatibility,
      idempotencyKey:
        normalizedText(opts.idempotencyKey, "idempotencyKey", 160) ?? null,
    })
    .returning();
  await db
    .update(discoveryHandles)
    .set({ usedAt: new Date() })
    .where(eq(discoveryHandles.id, handle.id));
  await deliverDiscoveryInbox({
    userId: handle.candidateUserId,
    kind: "discovery.interest_received",
    summary: `A compatible participant requested a ${handle.intentSlug.replaceAll("_", " ")} introduction.`,
    body: {
      interestId: interest.id,
      intentSlug: handle.intentSlug,
      compatibility: handle.compatibility,
      instructions:
        "Explain the compatibility summary to your human. Identity is still hidden. The human must approve or decline in HoneyMatcha.",
    },
  });
  await writeAudit({
    actorUserId: opts.actor.user.id,
    actorApiKeyId: opts.actor.apiKeyId,
    actorKind: opts.actor.kind,
    action: "discovery.interest_requested",
    entityType: "discovery_interest",
    entityId: interest.id,
    metadata: { intentSlug: handle.intentSlug },
  });
  return {
    interestId: interest.id,
    status: interest.status,
    message:
      "Interest recorded. The other participant remains anonymous until they approve.",
  };
}

function disclosureFields(
  enrollment: PurposeEnrollment,
  user: User,
  definition: IntentDefinition,
) {
  const allowed = new Set(definition.disclosure.fields);
  const source = {
    ...(enrollment.publicClaims as Record<string, unknown>),
    ...(enrollment.disclosureClaims as Record<string, unknown>),
  };
  const fields: Record<string, unknown> = {
    displayName: user.name?.trim() || "HoneyMatcha participant",
  };
  for (const key of allowed) {
    if (source[key] !== undefined) fields[key] = source[key];
  }
  return fields;
}

export async function decideDiscoveryInterest(opts: {
  user: User;
  interestId: string;
  decision: "accept" | "decline";
}) {
  const db = getDb();
  const [interest] = await db
    .select()
    .from(discoveryInterests)
    .where(
      and(
        eq(discoveryInterests.id, opts.interestId),
        eq(discoveryInterests.recipientUserId, opts.user.id),
      ),
    )
    .limit(1);
  if (!interest) throw new AgentApiError(404, "Introduction request not found");
  if (interest.status !== "pending") {
    throw new AgentApiError(409, `Introduction is already ${interest.status}`);
  }
  if (opts.decision === "decline") {
    const [updated] = await db
      .update(discoveryInterests)
      .set({ status: "declined", decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(discoveryInterests.id, interest.id))
      .returning();
    await writeAudit({
      actorUserId: opts.user.id,
      action: "discovery.interest_decided",
      entityType: "discovery_interest",
      entityId: interest.id,
      metadata: { decision: "decline", intentSlug: interest.intentSlug },
    });
    return { interestId: updated.id, status: updated.status };
  }

  await assertSafetyActive(interest.requesterUserId);
  await assertSafetyActive(interest.recipientUserId);
  await assertNotBlocked(
    interest.requesterUserId,
    interest.recipientUserId,
  );
  const { definition } = await getDiscoveryIntent(interest.intentSlug);
  const [requesterEnrollment, recipientEnrollment, requesterUser] =
    await Promise.all([
      activeEnrollment(interest.requesterUserId, interest.intentSlug),
      activeEnrollment(interest.recipientUserId, interest.intentSlug),
      db
        .select()
        .from(users)
        .where(eq(users.id, interest.requesterUserId))
        .limit(1)
        .then((rows) => rows[0]),
    ]);
  if (!requesterUser) {
    throw new AgentApiError(409, "Requester is no longer available");
  }
  const requesterFields = disclosureFields(
    requesterEnrollment,
    requesterUser,
    definition,
  );
  const recipientFields = disclosureFields(
    recipientEnrollment,
    opts.user,
    definition,
  );
  await db.insert(discoveryDisclosures).values([
    {
      interestId: interest.id,
      grantorUserId: requesterUser.id,
      granteeUserId: opts.user.id,
      fields: requesterFields,
    },
    {
      interestId: interest.id,
      grantorUserId: opts.user.id,
      granteeUserId: requesterUser.id,
      fields: recipientFields,
    },
  ]);
  let sessionId: string | null = null;
  if (interest.intentSlug === "local_meetup") {
    const [session] = await db
      .insert(sessions)
      .values({
        intentType: "local_meetup",
        initiatorUserId: interest.requesterUserId,
        peerUserId: interest.recipientUserId,
        status: "open",
        payload: {
          discoveryInterestId: interest.id,
          disclosureStage: "mutual_interest",
        },
      })
      .returning();
    sessionId = session.id;
  }
  const [updated] = await db
    .update(discoveryInterests)
    .set({
      status: "accepted",
      decidedAt: new Date(),
      updatedAt: new Date(),
      sessionId,
    })
    .where(eq(discoveryInterests.id, interest.id))
    .returning();
  await Promise.all([
    deliverDiscoveryInbox({
      userId: interest.requesterUserId,
      sessionId,
      kind: "discovery.introduction_accepted",
      summary:
        "Mutual interest confirmed. Only the approved introduction fields are now available.",
      body: {
        interestId: interest.id,
        intentSlug: interest.intentSlug,
        sessionId,
        disclosure: recipientFields,
        instructions:
          "Tell your human mutual interest is confirmed. Do not infer or request undisclosed details.",
      },
    }),
    deliverDiscoveryInbox({
      userId: interest.recipientUserId,
      sessionId,
      kind: "discovery.introduction_accepted",
      summary:
        "Mutual interest confirmed. Only the approved introduction fields are now available.",
      body: {
        interestId: interest.id,
        intentSlug: interest.intentSlug,
        sessionId,
        disclosure: requesterFields,
        instructions:
          "Tell your human mutual interest is confirmed. Do not infer or request undisclosed details.",
      },
    }),
  ]);
  await writeAudit({
    actorUserId: opts.user.id,
    action: "discovery.interest_decided",
    entityType: "discovery_interest",
    entityId: interest.id,
    metadata: {
      decision: "accept",
      intentSlug: interest.intentSlug,
      disclosedFields: definition.disclosure.fields,
      sessionId,
    },
  });
  return {
    interestId: updated.id,
    status: updated.status,
    sessionId,
    disclosure: requesterFields,
    message:
      "Mutual interest confirmed. Only approved introduction fields were disclosed.",
  };
}

export async function listDiscoveryInterests(userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(discoveryInterests)
    .where(
      or(
        eq(discoveryInterests.requesterUserId, userId),
        eq(discoveryInterests.recipientUserId, userId),
      ),
    )
    .orderBy(desc(discoveryInterests.createdAt))
    .limit(100);
  const ids = rows.map((row) => row.id);
  const disclosures = ids.length
    ? await db
        .select()
        .from(discoveryDisclosures)
        .where(
          and(
            inArray(discoveryDisclosures.interestId, ids),
            eq(discoveryDisclosures.granteeUserId, userId),
            isNull(discoveryDisclosures.revokedAt),
          ),
        )
    : [];
  const disclosureByInterest = new Map(
    disclosures.map((row) => [row.interestId, row.fields]),
  );
  return rows.map((row) => ({
    id: row.id,
    intentSlug: row.intentSlug,
    direction:
      row.requesterUserId === userId
        ? ("outgoing" as const)
        : ("incoming" as const),
    status: row.status,
    compatibility: row.compatibility,
    disclosure:
      row.status === "accepted"
        ? (disclosureByInterest.get(row.id) ?? {})
        : null,
    sessionId: row.status === "accepted" ? row.sessionId : null,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  }));
}

async function userPairFromInterest(userId: string, interestId: string) {
  const [interest] = await getDb()
    .select()
    .from(discoveryInterests)
    .where(eq(discoveryInterests.id, interestId))
    .limit(1);
  if (
    !interest ||
    (interest.requesterUserId !== userId &&
      interest.recipientUserId !== userId)
  ) {
    throw new AgentApiError(404, "Introduction not found");
  }
  return {
    interest,
    otherUserId:
      interest.requesterUserId === userId
        ? interest.recipientUserId
        : interest.requesterUserId,
  };
}

export async function blockDiscoveryParticipant(opts: {
  actor: DiscoveryActor;
  interestId: string;
  reasonCode?: unknown;
}) {
  const { interest, otherUserId } = await userPairFromInterest(
    opts.actor.user.id,
    opts.interestId,
  );
  const reasonCode = normalizedText(opts.reasonCode, "reasonCode", 80);
  const [block] = await getDb()
    .insert(discoveryBlocks)
    .values({
      blockerUserId: opts.actor.user.id,
      blockedUserId: otherUserId,
      reasonCode,
    })
    .onConflictDoUpdate({
      target: [
        discoveryBlocks.blockerUserId,
        discoveryBlocks.blockedUserId,
      ],
      set: { reasonCode },
    })
    .returning();
  await getDb()
    .update(discoveryDisclosures)
    .set({ revokedAt: new Date() })
    .where(eq(discoveryDisclosures.interestId, interest.id));
  await writeAudit({
    actorUserId: opts.actor.user.id,
    actorApiKeyId: opts.actor.apiKeyId,
    actorKind: opts.actor.kind,
    action: "discovery.blocked",
    entityType: "discovery_interest",
    entityId: interest.id,
    metadata: { reasonCode },
  });
  return {
    blockId: block.id,
    message:
      "Participant blocked. Future discovery and disclosure are prevented.",
  };
}

export async function reportDiscoveryParticipant(opts: {
  actor: DiscoveryActor;
  interestId: string;
  reasonCode: unknown;
  details?: unknown;
  block?: boolean;
}) {
  const { interest, otherUserId } = await userPairFromInterest(
    opts.actor.user.id,
    opts.interestId,
  );
  const reasonCode = normalizedText(opts.reasonCode, "reasonCode", 80);
  if (!reasonCode) throw new AgentApiError(400, "reasonCode is required");
  const details = normalizedText(opts.details, "details", 2_000);
  const [report] = await getDb()
    .insert(safetyReports)
    .values({
      reporterUserId: opts.actor.user.id,
      subjectUserId: otherUserId,
      interestId: interest.id,
      reasonCode,
      details,
    })
    .returning();
  if (opts.block !== false) {
    await blockDiscoveryParticipant({
      actor: opts.actor,
      interestId: interest.id,
      reasonCode: "reported",
    });
  }
  await writeAudit({
    actorUserId: opts.actor.user.id,
    actorApiKeyId: opts.actor.apiKeyId,
    actorKind: opts.actor.kind,
    action: "discovery.reported",
    entityType: "safety_report",
    entityId: report.id,
    metadata: { interestId: interest.id, reasonCode },
  });
  return {
    reportId: report.id,
    status: report.status,
    blocked: opts.block !== false,
  };
}

export async function listUserDiscoveryAudit(userId: string) {
  return getDb()
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.actorUserId, userId),
        inArray(auditLogs.action, [...DISCOVERY_AUDIT_ACTIONS]),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(100);
}

export async function setDiscoverySafetyStatus(opts: {
  moderator: User;
  subjectUserId: string;
  status: "active" | "restricted" | "suspended";
  reasonCode?: string;
}) {
  const [row] = await getDb()
    .insert(userSafety)
    .values({
      userId: opts.subjectUserId,
      status: opts.status,
      reasonCode: opts.reasonCode ?? null,
      decidedByUserId: opts.moderator.id,
      decidedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userSafety.userId,
      set: {
        status: opts.status,
        reasonCode: opts.reasonCode ?? null,
        decidedByUserId: opts.moderator.id,
        decidedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();
  if (opts.status !== "active") {
    await getDb()
      .update(purposeEnrollments)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(purposeEnrollments.userId, opts.subjectUserId));
  }
  await writeAudit({
    actorUserId: opts.moderator.id,
    action: "discovery.safety_status_changed",
    entityType: "user",
    entityId: opts.subjectUserId,
    metadata: { status: opts.status, reasonCode: opts.reasonCode ?? null },
  });
  return row;
}

export async function cleanupExpiredDiscoveryData(now = new Date()) {
  const db = getDb();
  const expiredHandles = await db
    .delete(discoveryHandles)
    .where(lt(discoveryHandles.expiresAt, now))
    .returning({ id: discoveryHandles.id });
  const dueEnrollments = await db
    .select()
    .from(purposeEnrollments)
    .where(lt(purposeEnrollments.expiresAt, now));
  let redactedClaims = 0;
  for (const enrollment of dueEnrollments) {
    const publicClaims = {
      ...(enrollment.publicClaims as Record<string, unknown>),
    };
    const privateClaims = decryptJson(enrollment.privateClaimsEncrypted);
    const disclosureClaims = {
      ...(enrollment.disclosureClaims as Record<string, unknown>),
    };
    const provenance = {
      ...(enrollment.claimProvenance as Record<string, unknown>),
    };
    for (const [key, value] of Object.entries(provenance)) {
      const expiresAt =
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof (value as Record<string, unknown>).expiresAt === "string"
          ? new Date(String((value as Record<string, unknown>).expiresAt))
          : null;
      if (expiresAt && expiresAt <= now) {
        delete publicClaims[key];
        delete privateClaims[key];
        delete disclosureClaims[key];
        delete provenance[key];
        redactedClaims += 1;
      }
    }
    await db
      .update(purposeEnrollments)
      .set({
        status: "paused",
        publicClaims,
        privateClaimsEncrypted: encryptJson(privateClaims),
        disclosureClaims,
        claimProvenance: provenance,
        expiresAt:
          Object.keys(provenance).length > 0
            ? earliestProvenanceExpiry(provenance)
            : null,
        updatedAt: now,
      })
      .where(eq(purposeEnrollments.id, enrollment.id));
  }
  return {
    expiredHandles: expiredHandles.length,
    pausedEnrollments: dueEnrollments.length,
    redactedClaims,
  };
}
