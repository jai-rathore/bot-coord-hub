import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { and, asc, eq, isNull } from "drizzle-orm";
import { timingSafeEqual } from "crypto";
import { getDb } from "@/db";
import { intentProposals, type IntentProposal } from "@/db/schema";
import { findDedupeHits } from "@/lib/intents";
import { writeAudit } from "@/lib/audit";

export type TriageRecommendation = "publish" | "reject" | "needs_review";

export type TriageResult = {
  recommendation: TriageRecommendation;
  reason: string;
  source: "heuristic" | "openai" | "grok";
};

const VAGUE = new Set([
  "test",
  "foo",
  "bar",
  "asdf",
  "todo",
  "misc",
  "other",
  "stuff",
  "thing",
  "intent",
  "new",
]);

/**
 * Deterministic heuristic. Never publishes: only recommends.
 */
export function heuristicTriage(proposal: {
  name: string;
  slug: string;
  description: string | null;
  similarCount: number;
  exactConflict: boolean;
}): TriageResult {
  const name = proposal.name.trim();
  const desc = (proposal.description ?? "").trim();
  const words = name.split(/\s+/).filter(Boolean);

  if (proposal.exactConflict) {
    return {
      recommendation: "reject",
      reason: "Exact name/slug already exists in the registry.",
      source: "heuristic",
    };
  }

  if (name.length < 4 || words.length < 1) {
    return {
      recommendation: "reject",
      reason: "Name is too short to be a clear coordination intent.",
      source: "heuristic",
    };
  }

  if (VAGUE.has(name.toLowerCase()) || VAGUE.has(proposal.slug)) {
    return {
      recommendation: "reject",
      reason: "Name/slug looks like a placeholder, not a real intent.",
      source: "heuristic",
    };
  }

  if (proposal.similarCount > 0) {
    return {
      recommendation: "needs_review",
      reason: `Similar intents already exist (${proposal.similarCount}); human should confirm uniqueness.`,
      source: "heuristic",
    };
  }

  if (desc.length < 12) {
    return {
      recommendation: "needs_review",
      reason: "Description is thin: publisher should verify the intent is actionable.",
      source: "heuristic",
    };
  }

  const actionish =
    /\b(schedule|book|share|sync|invite|confirm|coordinate|request|send|meet)\b/i.test(
      `${name} ${desc}`,
    );
  if (actionish) {
    return {
      recommendation: "publish",
      reason:
        "Clear action-oriented intent with a usable description; no close duplicates found.",
      source: "heuristic",
    };
  }

  return {
    recommendation: "needs_review",
    reason: "No strong reject signal, but intent is not clearly action-oriented.",
    source: "heuristic",
  };
}

async function llmTriage(proposal: {
  name: string;
  slug: string;
  description: string | null;
}): Promise<TriageResult | null> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const grokKey =
    process.env.GROK_API_KEY?.trim() || process.env.XAI_API_KEY?.trim();

  const prompt = `You triage coordination intent proposals for HoneyMatcha.
Return ONLY compact JSON: {"recommendation":"publish"|"reject"|"needs_review","reason":"..."}.
Do NOT auto-publish: recommendation only.
Name: ${proposal.name}
Slug: ${proposal.slug}
Description: ${proposal.description ?? "(none)"}`;

  if (openaiKey) {
    try {
      const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_TRIAGE_MODEL || "gpt-4o-mini",
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "You are a strict intent registry triage assistant. Reply with JSON only.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const parsed = parseLlmJson(data.choices?.[0]?.message?.content);
      if (parsed) return { ...parsed, source: "openai" };
    } catch {
      return null;
    }
  }

  if (grokKey) {
    try {
      const res = await fetchWithTimeout("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${grokKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.GROK_TRIAGE_MODEL || "grok-2-latest",
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "You are a strict intent registry triage assistant. Reply with JSON only.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const parsed = parseLlmJson(data.choices?.[0]?.message?.content);
      if (parsed) return { ...parsed, source: "grok" };
    } catch {
      return null;
    }
  }

  return null;
}

function parseLlmJson(
  content: string | undefined,
): Omit<TriageResult, "source"> | null {
  if (!content) return null;
  try {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(content.slice(start, end + 1)) as {
      recommendation?: string;
      reason?: string;
    };
    const rec = obj.recommendation;
    if (
      rec !== "publish" &&
      rec !== "reject" &&
      rec !== "needs_review"
    ) {
      return null;
    }
    const reason = (obj.reason ?? "").trim();
    if (!reason) return null;
    return { recommendation: rec, reason };
  } catch {
    return null;
  }
}

export async function triageProposal(
  proposal: IntentProposal,
): Promise<TriageResult> {
  const hits = await findDedupeHits(proposal.name, proposal.slug);
  const others = hits.filter((h) => h.slug !== proposal.slug || h.source === "type");
  const exactConflict = others.some(
    (h) =>
      h.slug === proposal.slug ||
      h.name.toLowerCase() === proposal.name.toLowerCase(),
  );

  const base = heuristicTriage({
    name: proposal.name,
    slug: proposal.slug,
    description: proposal.description,
    similarCount: others.length,
    exactConflict,
  });

  // Optional model opinion; fall back to heuristic.
  const llm = await llmTriage(proposal);
  if (!llm) return base;

  // Prefer LLM when heuristic is needs_review; otherwise keep heuristic reject.
  if (base.recommendation === "reject") {
    return {
      ...base,
      reason: `${base.reason} (model also said ${llm.recommendation}: ${llm.reason})`,
    };
  }
  return llm;
}

/**
 * Claim and triage up to `limit` queued pending proposals.
 * Writes recommendation + reason only: never changes status to live/rejected.
 */
export async function runTriageWorker(opts?: {
  limit?: number;
  actorUserId?: string | null;
}): Promise<{ processed: number; results: Array<{ id: string; slug: string; result: TriageResult }> }> {
  const limit = Math.min(Math.max(opts?.limit ?? 10, 1), 50);
  const db = getDb();

  const queued = await db
    .select()
    .from(intentProposals)
    .where(
      and(
        eq(intentProposals.status, "pending"),
        isNull(intentProposals.triagedAt),
      ),
    )
    .orderBy(asc(intentProposals.triageQueuedAt))
    .limit(limit);

  const results: Array<{ id: string; slug: string; result: TriageResult }> = [];

  for (const proposal of queued) {
    const result = await triageProposal(proposal);
    const now = new Date();
    await db
      .update(intentProposals)
      .set({
        triageRecommendation: result.recommendation,
        triageReason: result.reason,
        triagedAt: now,
        updatedAt: now,
      })
      .where(eq(intentProposals.id, proposal.id));

    await writeAudit({
      actorUserId: opts?.actorUserId ?? null,
      action: "intent.triaged",
      entityType: "intent_proposal",
      entityId: proposal.id,
      metadata: {
        slug: proposal.slug,
        recommendation: result.recommendation,
        reason: result.reason,
        source: result.source,
      },
    });

    results.push({ id: proposal.id, slug: proposal.slug, result });
  }

  return { processed: results.length, results };
}

export function assertTriageSecret(request: Request): boolean {
  const secret = process.env.TRIAGE_SECRET?.trim();
  if (!secret) return false;
  const header =
    request.headers.get("x-triage-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!header) return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from(secret);
  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
}
