"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type PendingProposal = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  proposedByEmail: string | null;
  triageRecommendation: "publish" | "reject" | "needs_review" | null;
  triageReason: string | null;
  triagedAt: string | null;
  createdAt: string;
  canModerate: boolean;
};

const REC_STYLES: Record<string, string> = {
  publish: "bg-[rgba(58,107,79,0.12)] text-matcha-deep",
  reject: "bg-[rgba(155,59,59,0.1)] text-danger",
  needs_review: "bg-[rgba(196,154,60,0.18)] text-[#6b5420]",
};

export function IntentModeration({
  initialPending,
  canRunTriage,
}: {
  initialPending: PendingProposal[];
  canRunTriage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>(
    {},
  );

  async function runTriage() {
    setError(null);
    setInfo(null);
    const res = await fetch("/api/intents/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 20 }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Triage failed");
      return;
    }
    setInfo(`Triaged ${data.processed} proposal(s).`);
    startTransition(() => router.refresh());
  }

  async function decide(id: string, action: "publish" | "reject") {
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/intents/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        reason: action === "reject" ? rejectReasons[id] ?? "" : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? `Failed to ${action}`);
      return;
    }
    setInfo(
      action === "publish"
        ? `Published “${data.proposal.name}”.`
        : `Rejected “${data.proposal.name}”.`,
    );
    startTransition(() => router.refresh());
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
            Publish gate
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Pending proposals stay private until published. Triage adds a
            recommendation only — it never auto-publishes.
          </p>
        </div>
        {canRunTriage && (
          <button
            type="button"
            disabled={pending}
            onClick={() => void runTriage()}
            className="cursor-pointer rounded-md border border-line bg-white/80 px-3 py-2 text-sm font-semibold text-matcha-deep transition hover:border-matcha disabled:opacity-60"
          >
            Run triage
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      {info && (
        <p className="text-sm font-medium text-matcha-deep">{info}</p>
      )}

      {initialPending.length === 0 ? (
        <p className="text-sm text-muted">No pending proposals.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-b border-line">
          {initialPending.map((p) => (
            <li key={p.id} className="space-y-3 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-ink">{p.name}</h3>
                <code className="rounded bg-code-bg px-1.5 py-0.5 text-xs text-matcha-deep">
                  {p.slug}
                </code>
                {p.triageRecommendation ? (
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${REC_STYLES[p.triageRecommendation]}`}
                  >
                    triage: {p.triageRecommendation.replace("_", " ")}
                  </span>
                ) : (
                  <span className="rounded bg-[rgba(196,154,60,0.18)] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[#6b5420]">
                    awaiting triage
                  </span>
                )}
              </div>
              {p.description && (
                <p className="text-sm text-muted">{p.description}</p>
              )}
              {p.triageReason && (
                <p className="text-sm text-ink">
                  <span className="font-medium text-matcha-deep">Triage: </span>
                  {p.triageReason}
                </p>
              )}
              {p.proposedByEmail && (
                <p className="text-xs text-muted">Proposed by {p.proposedByEmail}</p>
              )}

              {p.canModerate ? (
                <div className="flex flex-wrap items-end gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void decide(p.id, "publish")}
                    className="button-primary min-h-9 cursor-pointer px-3 py-1.5 text-sm disabled:opacity-60"
                  >
                    Publish live
                  </button>
                  <label className="grid min-w-[16rem] flex-1 gap-1 text-sm">
                    <span className="font-medium text-ink">Reject reason</span>
                    <input
                      value={rejectReasons[p.id] ?? ""}
                      onChange={(e) =>
                        setRejectReasons((prev) => ({
                          ...prev,
                          [p.id]: e.target.value,
                        }))
                      }
                      placeholder="Why reject?"
                      className="rounded-md border border-line bg-white/80 px-3 py-1.5 outline-none focus:border-matcha"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={pending || !(rejectReasons[p.id] ?? "").trim()}
                    onClick={() => void decide(p.id, "reject")}
                    className="cursor-pointer rounded-md border border-danger px-3 py-1.5 text-sm font-semibold text-danger transition hover:bg-[rgba(155,59,59,0.08)] disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted">
                  Waiting for the proposer or an intent admin to decide.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
