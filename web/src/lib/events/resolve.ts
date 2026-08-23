/**
 * Deterministic resolution. No model is ever involved in deciding an event.
 *
 * Scoring is `yes * 1.0 + maybe * 0.5`, filtered by quorum and capacity, with
 * a fixed tie-break chain so repeated runs over identical data always agree.
 */

import type { EventPref } from "@/lib/events/types";

export type ResolvableOption = {
  id: string;
  position: number;
  status: string;
  capacity: number | null;
  startsAt: Date | null;
  /** Count of participants with a hard calendar conflict at this option. */
  conflicts?: number;
  /** The organizer's own preference, when they expressed one. */
  organizerPref?: EventPref | null;
};

export type ResolvableVote = {
  optionId: string;
  value: EventPref;
};

export type OptionScore = {
  optionId: string;
  yes: number;
  maybe: number;
  no: number;
  score: number;
  eligible: boolean;
  atCapacity: boolean;
};

export type ResolutionOutcome = {
  scores: OptionScore[];
  winner: OptionScore | null;
  quorumMet: boolean;
  reason:
    | "resolved"
    | "quorum_not_met"
    | "no_options"
    | "no_responses";
};

export function scoreOptions(
  options: ResolvableOption[],
  votes: ResolvableVote[],
): OptionScore[] {
  const active = options.filter((o) => o.status === "active");
  const byOption = new Map<string, { yes: number; maybe: number; no: number }>();
  for (const option of active) {
    byOption.set(option.id, { yes: 0, maybe: 0, no: 0 });
  }
  for (const vote of votes) {
    const bucket = byOption.get(vote.optionId);
    if (!bucket) continue;
    bucket[vote.value] += 1;
  }
  return active.map((option) => {
    const bucket = byOption.get(option.id) ?? { yes: 0, maybe: 0, no: 0 };
    const atCapacity =
      option.capacity != null && bucket.yes > option.capacity;
    return {
      optionId: option.id,
      yes: bucket.yes,
      maybe: bucket.maybe,
      no: bucket.no,
      score: bucket.yes + bucket.maybe * 0.5,
      eligible: true,
      atCapacity,
    };
  });
}

/**
 * Tie-break chain, applied in order:
 *   1. highest score
 *   2. highest yes count
 *   3. fewest hard calendar conflicts
 *   4. organizer's own preference
 *   5. earliest start
 *   6. lowest position  (stable: results never flap)
 */
function compareOptions(
  a: OptionScore,
  b: OptionScore,
  meta: Map<string, ResolvableOption>,
): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.yes !== a.yes) return b.yes - a.yes;

  const optA = meta.get(a.optionId);
  const optB = meta.get(b.optionId);

  const conflictA = optA?.conflicts ?? 0;
  const conflictB = optB?.conflicts ?? 0;
  if (conflictA !== conflictB) return conflictA - conflictB;

  const prefRank = (pref: EventPref | null | undefined): number =>
    pref === "yes" ? 0 : pref === "maybe" ? 1 : pref === "no" ? 3 : 2;
  const rankA = prefRank(optA?.organizerPref);
  const rankB = prefRank(optB?.organizerPref);
  if (rankA !== rankB) return rankA - rankB;

  const startA = optA?.startsAt?.getTime();
  const startB = optB?.startsAt?.getTime();
  if (startA != null && startB != null && startA !== startB) {
    return startA - startB;
  }

  return (optA?.position ?? 0) - (optB?.position ?? 0);
}

export function resolveDimension(
  options: ResolvableOption[],
  votes: ResolvableVote[],
  quorumMin: number | null,
): ResolutionOutcome {
  const active = options.filter((o) => o.status === "active");
  if (active.length === 0) {
    return { scores: [], winner: null, quorumMet: false, reason: "no_options" };
  }

  const scores = scoreOptions(active, votes);
  const anyResponse = scores.some((s) => s.yes + s.maybe + s.no > 0);
  if (!anyResponse) {
    return { scores, winner: null, quorumMet: false, reason: "no_responses" };
  }

  const required = quorumMin ?? 0;
  const eligible = scores
    .map((s) => ({
      ...s,
      eligible: s.yes >= required && !s.atCapacity,
    }))
    .filter((s) => s.eligible);

  if (eligible.length === 0) {
    return {
      scores: scores.map((s) => ({
        ...s,
        eligible: s.yes >= required && !s.atCapacity,
      })),
      winner: null,
      quorumMet: false,
      reason: "quorum_not_met",
    };
  }

  const meta = new Map(active.map((o) => [o.id, o] as const));
  const sorted = [...eligible].sort((a, b) => compareOptions(a, b, meta));

  return {
    scores: scores.map((s) => ({
      ...s,
      eligible: s.yes >= required && !s.atCapacity,
    })),
    winner: sorted[0] ?? null,
    quorumMet: true,
    reason: "resolved",
  };
}

/** True when the event may lock early under `on_quorum`. */
export function quorumSatisfied(
  outcome: ResolutionOutcome,
  quorumMin: number | null,
): boolean {
  if (quorumMin == null) return false;
  return outcome.quorumMet && (outcome.winner?.yes ?? 0) >= quorumMin;
}
