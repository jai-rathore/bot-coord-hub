import { and, desc, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  sageDiscoveryMessages,
  sageDiscoveryThreads,
  type User,
} from "@/db/schema";
import { AgentApiError } from "@/lib/agent-errors";
import { writeAudit } from "@/lib/audit";
import {
  getDiscoveryIntentContract,
  submitDiscoveryEnrollment,
} from "@/lib/discovery-service";
import { distributedRateLimit } from "@/lib/distributed-rate-limit";
import { getLlmProvider, type LlmMessage } from "@/lib/llm";
import {
  consumeLocationResolutionToken,
  issueLocationResolutionToken,
  resolveLocationSuggestions,
  type LocationSuggestion,
} from "@/lib/location-resolver";
import {
  decryptJson,
  decryptSecret,
  encryptJson,
  encryptSecret,
} from "@/lib/secret-crypto";
import { boundedText } from "@/lib/validation";
import { enqueueSageJob } from "./job-store";
import {
  buildDiscoveryIntakeRequest,
  DISCOVERY_INTAKE_TOOL_NAME,
  EMPTY_SAGE_DISCOVERY_DRAFT,
  parseDiscoveryIntakeTool,
  type SageDiscoveryDraft,
} from "./discovery-intake";

type PendingLocationGroup = {
  target: "coarse" | `claim:${string}`;
  query: string;
  options: LocationSuggestion[];
};

type PendingLocations = { groups: PendingLocationGroup[] };

export type SageDiscoveryTelemetry = {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

function parseDraft(value: string): SageDiscoveryDraft {
  const parsed = decryptJson(value);
  return {
    claims:
      parsed.claims &&
      typeof parsed.claims === "object" &&
      !Array.isArray(parsed.claims)
        ? (parsed.claims as Record<string, unknown>)
        : {},
    coarseLocation:
      parsed.coarseLocation &&
      typeof parsed.coarseLocation === "object" &&
      !Array.isArray(parsed.coarseLocation)
        ? (parsed.coarseLocation as SageDiscoveryDraft["coarseLocation"])
        : null,
    claimLocations:
      parsed.claimLocations &&
      typeof parsed.claimLocations === "object" &&
      !Array.isArray(parsed.claimLocations)
        ? (parsed.claimLocations as SageDiscoveryDraft["claimLocations"])
        : {},
  };
}

function parsePending(value: string | null): PendingLocations {
  if (!value) return { groups: [] };
  const parsed = decryptJson(value);
  return {
    groups: Array.isArray(parsed.groups)
      ? (parsed.groups as PendingLocationGroup[])
      : [],
  };
}

function missingDraftFields(
  draft: SageDiscoveryDraft,
  definition: Awaited<
    ReturnType<typeof getDiscoveryIntentContract>
  >["definition"],
) {
  const missing = definition.enrollment.fields
    .filter((field) => {
      if (!field.required) return false;
      if (field.type === "location_list") {
        return !(draft.claimLocations[field.key]?.length > 0);
      }
      const value = draft.claims[field.key];
      return (
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      );
    })
    .map((field) => field.key);
  if (
    definition.discovery.locationGranularity !== "none" &&
    !draft.coarseLocation
  ) {
    missing.push("matchingLocation");
  }
  return missing;
}

async function getThreadForUser(userId: string, threadId: string) {
  const [thread] = await getDb()
    .select()
    .from(sageDiscoveryThreads)
    .where(
      and(
        eq(sageDiscoveryThreads.id, threadId),
        eq(sageDiscoveryThreads.userId, userId),
      ),
    )
    .limit(1);
  if (!thread) {
    throw new AgentApiError(404, "Sage discovery conversation not found");
  }
  return thread;
}

export async function getOrCreateSageDiscoveryThread(input: {
  user: User;
  intentSlug: string;
}) {
  await getDiscoveryIntentContract(input.intentSlug);
  const db = getDb();
  const [existing] = await db
    .select()
    .from(sageDiscoveryThreads)
    .where(
      and(
        eq(sageDiscoveryThreads.userId, input.user.id),
        eq(sageDiscoveryThreads.intentSlug, input.intentSlug),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(sageDiscoveryThreads)
    .values({
      userId: input.user.id,
      intentSlug: input.intentSlug,
      draftEncrypted: encryptJson(EMPTY_SAGE_DISCOVERY_DRAFT),
    })
    .onConflictDoNothing({
      target: [sageDiscoveryThreads.userId, sageDiscoveryThreads.intentSlug],
    })
    .returning();
  if (created) return created;
  const [raced] = await db
    .select()
    .from(sageDiscoveryThreads)
    .where(
      and(
        eq(sageDiscoveryThreads.userId, input.user.id),
        eq(sageDiscoveryThreads.intentSlug, input.intentSlug),
      ),
    )
    .limit(1);
  if (!raced) throw new Error("Sage conversation could not be created");
  return raced;
}

export async function publicSageDiscoveryThread(input: {
  user: User;
  intentSlug: string;
}) {
  const [thread, contract] = await Promise.all([
    getOrCreateSageDiscoveryThread(input),
    getDiscoveryIntentContract(input.intentSlug),
  ]);
  const rows = await getDb()
    .select()
    .from(sageDiscoveryMessages)
    .where(eq(sageDiscoveryMessages.threadId, thread.id))
    .orderBy(desc(sageDiscoveryMessages.createdAt))
    .limit(30);
  const draft = parseDraft(thread.draftEncrypted);
  const pending = parsePending(thread.pendingLocationsEncrypted);
  return {
    id: thread.id,
    intentSlug: thread.intentSlug,
    state: thread.state,
    latestJobId: thread.latestJobId,
    draft: {
      claims: draft.claims,
      coarseLocation: draft.coarseLocation
        ? {
            label: draft.coarseLocation.label,
            granularity: draft.coarseLocation.granularity,
          }
        : null,
      claimLocations: Object.fromEntries(
        Object.entries(draft.claimLocations).map(([key, locations]) => [
          key,
          locations.map((location) => ({
            label: location.label,
            granularity: location.granularity,
          })),
        ]),
      ),
    },
    missingFields: missingDraftFields(draft, contract.definition),
    questions: contract.definition.enrollment.fields.map((field) => ({
      key: field.key,
      prompt: field.prompt,
      required: field.required,
      sensitivity: field.sensitivity,
      sourcePolicy: field.sourcePolicy,
    })),
    matchingLocationGranularity: contract.definition.discovery.locationGranularity,
    locationChoices: pending.groups.flatMap((group) =>
      group.options.map((option) => ({
        target: group.target,
        query: group.query,
        resolutionToken: option.resolutionToken,
        label: option.place.label,
        granularity: option.place.granularity,
      })),
    ),
    messages: rows.reverse().map((message) => ({
      id: message.id,
      role: message.role,
      body: decryptSecret(message.bodyEncrypted),
      createdAt: message.createdAt.toISOString(),
    })),
    updatedAt: thread.updatedAt.toISOString(),
  };
}

export async function enqueueSageDiscoveryMessage(input: {
  user: User;
  intentSlug: string;
  message: unknown;
  clientMessageId: string;
}) {
  const body = boundedText(input.message, "message", 2_000, {
    required: true,
  })!;
  const thread = await getOrCreateSageDiscoveryThread(input);
  const db = getDb();
  const [created] = await db
    .insert(sageDiscoveryMessages)
    .values({
      threadId: thread.id,
      role: "human",
      clientMessageId: input.clientMessageId,
      bodyEncrypted: encryptSecret(body),
    })
    .onConflictDoNothing({
      target: [
        sageDiscoveryMessages.threadId,
        sageDiscoveryMessages.clientMessageId,
      ],
      where: sql`${sageDiscoveryMessages.clientMessageId} is not null`,
    })
    .returning();
  const [message] = created
    ? [created]
    : await db
        .select()
        .from(sageDiscoveryMessages)
        .where(
          and(
            eq(sageDiscoveryMessages.threadId, thread.id),
            eq(
              sageDiscoveryMessages.clientMessageId,
              input.clientMessageId,
            ),
          ),
        )
        .limit(1);
  if (!message) throw new Error("Sage message could not be saved");
  const queued = await enqueueSageJob({
    user: input.user,
    capability: "discovery_intake",
    trigger: "user_request",
    payload: {
      threadId: thread.id,
      messageId: message.id,
      intentSlug: input.intentSlug,
    },
    idempotencyKey: `discovery-intake:${message.id}`,
  });
  await db
    .update(sageDiscoveryThreads)
    .set({ latestJobId: queued.job.id, updatedAt: new Date() })
    .where(eq(sageDiscoveryThreads.id, thread.id));
  return { threadId: thread.id, job: queued.job, created: queued.created };
}

export async function runSageDiscoveryIntake(input: {
  user: User;
  threadId: string;
  messageId: string;
}) {
  const thread = await getThreadForUser(input.user.id, input.threadId);
  const [message] = await getDb()
    .select()
    .from(sageDiscoveryMessages)
    .where(
      and(
        eq(sageDiscoveryMessages.id, input.messageId),
        eq(sageDiscoveryMessages.threadId, thread.id),
        eq(sageDiscoveryMessages.role, "human"),
      ),
    )
    .limit(1);
  if (!message) throw new AgentApiError(404, "Sage intake message not found");
  const contract = await getDiscoveryIntentContract(thread.intentSlug);
  const previousRows = await getDb()
    .select()
    .from(sageDiscoveryMessages)
    .where(
      and(
        eq(sageDiscoveryMessages.threadId, thread.id),
        lte(sageDiscoveryMessages.createdAt, message.createdAt),
      ),
    )
    .orderBy(desc(sageDiscoveryMessages.createdAt))
    .limit(11);
  const history: LlmMessage[] = previousRows
    .filter((row) => row.id !== message.id)
    .reverse()
    .map((row) => ({
      role: row.role === "sage" ? "model" : "user",
      text: decryptSecret(row.bodyEncrypted),
    }));
  const modelBudget = await distributedRateLimit(
    `sage-model:daily:${input.user.id}`,
    200,
    24 * 60 * 60 * 1_000,
  );
  if (!modelBudget.ok) {
    throw new AgentApiError(429, "Daily Sage conversation limit exceeded", {
      retryAfterSec: modelBudget.retryAfterSec,
    });
  }
  const provider = getLlmProvider();
  const completion = await provider.complete(
    buildDiscoveryIntakeRequest({
      intentName: contract.name,
      definition: contract.definition,
      draft: parseDraft(thread.draftEncrypted),
      history,
      userText: decryptSecret(message.bodyEncrypted),
    }),
  );
  const toolCall = completion.toolCalls[0];
  if (
    completion.toolCalls.length !== 1 ||
    toolCall?.name !== DISCOVERY_INTAKE_TOOL_NAME
  ) {
    throw new Error("Sage did not return one valid discovery draft update");
  }
  const parsed = parseDiscoveryIntakeTool({
    definition: contract.definition,
    currentDraft: parseDraft(thread.draftEncrypted),
    args: toolCall.args,
  });
  const previousPending = parsePending(thread.pendingLocationsEncrypted);
  const resolvedGroups: PendingLocationGroup[] = [];
  if (parsed.locationQueries.length) {
    const locationBudget = await distributedRateLimit(
      `sage-location:daily:${input.user.id}`,
      120,
      24 * 60 * 60 * 1_000,
    );
    if (!locationBudget.ok) {
      throw new AgentApiError(429, "Daily location lookup limit exceeded", {
        retryAfterSec: locationBudget.retryAfterSec,
      });
    }
  }
  for (const query of parsed.locationQueries.slice(0, 4)) {
    const resolved = await resolveLocationSuggestions({
      userId: input.user.id,
      query: query.query,
      granularity: query.granularity,
      limit: 5,
    });
    resolvedGroups.push({
      target: query.target,
      query: query.query,
      options: resolved.suggestions,
    });
  }
  const effectiveGroups = parsed.locationQueries.length
    ? resolvedGroups
    : previousPending.groups;
  const hasChoices = effectiveGroups.some((group) => group.options.length > 0);
  const reply = hasChoices
    ? `${parsed.reply} Choose the matching place below so I do not guess.`
    : parsed.reply;
  const state =
    parsed.missingFields.length === 0 && effectiveGroups.length === 0
      ? "ready_for_review"
      : "collecting";
  await getDb().transaction(async (tx) => {
    await tx
      .update(sageDiscoveryThreads)
      .set({
        state,
        draftEncrypted: encryptJson(parsed.draft),
        pendingLocationsEncrypted: effectiveGroups.length
          ? encryptJson({ groups: effectiveGroups })
          : null,
        updatedAt: new Date(),
      })
      .where(eq(sageDiscoveryThreads.id, thread.id));
    await tx.insert(sageDiscoveryMessages).values({
      threadId: thread.id,
      role: "sage",
      bodyEncrypted: encryptSecret(reply),
      metadata: {
        provider: completion.provider,
        model: completion.model,
        inputTokens: completion.tokensIn,
        outputTokens: completion.tokensOut,
      },
    });
  });
  await writeAudit({
    actorUserId: input.user.id,
    actorKind: "hosted_agent",
    action: "sage.discovery.intake_updated",
    entityType: "sage_discovery_thread",
    entityId: thread.id,
    metadata: {
      intentSlug: thread.intentSlug,
      capturedFields: Object.keys(parsed.draft.claims),
      missingFields: parsed.missingFields,
      locationChoiceGroups: effectiveGroups.length,
    },
  });
  return {
    result: {
      ok: true,
      threadId: thread.id,
      intentSlug: thread.intentSlug,
      reply,
      missingFields: parsed.missingFields,
      locationChoiceCount: effectiveGroups.reduce(
        (total, group) => total + group.options.length,
        0,
      ),
      readyForReview: state === "ready_for_review",
    },
    telemetry: {
      provider: completion.provider,
      model: completion.model,
      inputTokens: completion.tokensIn,
      outputTokens: completion.tokensOut,
    } satisfies SageDiscoveryTelemetry,
  };
}

export async function selectSageDiscoveryLocation(input: {
  user: User;
  threadId: string;
  target: string;
  resolutionToken: string;
}) {
  const thread = await getThreadForUser(input.user.id, input.threadId);
  const contract = await getDiscoveryIntentContract(thread.intentSlug);
  const pending = parsePending(thread.pendingLocationsEncrypted);
  const group = pending.groups.find(
    (candidate) =>
      candidate.target === input.target &&
      candidate.options.some(
        (option) => option.resolutionToken === input.resolutionToken,
      ),
  );
  const selected = group?.options.find(
    (option) => option.resolutionToken === input.resolutionToken,
  );
  if (!group || !selected) {
    throw new AgentApiError(409, "This location choice is no longer available");
  }
  const verifiedPlace = consumeLocationResolutionToken(
    input.user.id,
    input.resolutionToken,
    selected.place.granularity,
  );
  if (verifiedPlace.canonicalKey !== selected.place.canonicalKey) {
    throw new AgentApiError(409, "This location choice is no longer available");
  }
  const draft = parseDraft(thread.draftEncrypted);
  const selection = {
    label: verifiedPlace.label,
    granularity: verifiedPlace.granularity,
    place: verifiedPlace,
  };
  if (group.target === "coarse") {
    draft.coarseLocation = selection;
  } else {
    const key = group.target.slice("claim:".length);
    const existing = draft.claimLocations[key] ?? [];
    draft.claimLocations[key] = [
      ...existing.filter(
        (location) =>
          location.place.canonicalKey !== selected.place.canonicalKey,
      ),
      selection,
    ];
  }
  const remaining = pending.groups.filter((candidate) =>
    group.target === "coarse"
      ? candidate.target !== "coarse"
      : candidate !== group,
  );
  const missing = missingDraftFields(draft, contract.definition);
  const state =
    missing.length === 0 && remaining.length === 0
      ? "ready_for_review"
      : "collecting";
  await getDb()
    .update(sageDiscoveryThreads)
    .set({
      state,
      draftEncrypted: encryptJson(draft),
      pendingLocationsEncrypted: remaining.length
        ? encryptJson({ groups: remaining })
        : null,
      updatedAt: new Date(),
    })
    .where(eq(sageDiscoveryThreads.id, thread.id));
  return { state, missingFields: missing };
}

export async function prepareSageDiscoveryEnrollment(input: {
  user: User;
  threadId: string;
}) {
  const thread = await getThreadForUser(input.user.id, input.threadId);
  const contract = await getDiscoveryIntentContract(thread.intentSlug);
  const draft = parseDraft(thread.draftEncrypted);
  const missing = missingDraftFields(draft, contract.definition);
  if (missing.length) {
    throw new AgentApiError(400, "Discovery draft is incomplete", {
      missingFields: missing,
    });
  }
  const claims = { ...draft.claims };
  for (const [key, locations] of Object.entries(draft.claimLocations)) {
    claims[key] = locations.map((location) =>
      issueLocationResolutionToken(input.user.id, location.place),
    );
  }
  const provenance = Object.fromEntries(
    Object.keys(claims).map((key) => [
      key,
      { source: "authenticated_human_sage_conversation" },
    ]),
  );
  const enrollment = await submitDiscoveryEnrollment(
    { user: input.user, kind: "hosted_agent" },
    {
      intentSlug: thread.intentSlug,
      claims,
      provenance,
      location: draft.coarseLocation
        ? {
            resolutionToken: issueLocationResolutionToken(
              input.user.id,
              draft.coarseLocation.place,
            ),
            visibility: "private_match",
          }
        : undefined,
      requestActivation: false,
    },
  );
  const reply =
    "I prepared the enrollment snapshot. Review every value and approve it yourself before discovery can begin.";
  await getDb().transaction(async (tx) => {
    await tx
      .update(sageDiscoveryThreads)
      .set({ state: "submitted", updatedAt: new Date() })
      .where(eq(sageDiscoveryThreads.id, thread.id));
    await tx.insert(sageDiscoveryMessages).values({
      threadId: thread.id,
      role: "sage",
      bodyEncrypted: encryptSecret(reply),
    });
  });
  return {
    ok: true,
    threadId: thread.id,
    intentSlug: thread.intentSlug,
    enrollmentId: enrollment.id,
    enrollmentStatus: enrollment.status,
    approvalRequired: true,
    missingFields: enrollment.missingFields,
    message: reply,
  };
}
