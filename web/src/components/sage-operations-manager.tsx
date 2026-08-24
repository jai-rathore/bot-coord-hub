"use client";

import { useState } from "react";

type OperationsAlert = {
  key: string;
  severity: "warning" | "critical";
  message: string;
};

type OperationsSnapshot = {
  generatedAt: string;
  counts: Record<string, number>;
  oldestPendingAgeSeconds: number;
  repeatedRetryJobs: number;
  recentFailedRuns: number;
  recentProviderFailures: number;
  recentAverageLatencyMs: number;
  recentInputTokens: number;
  recentOutputTokens: number;
  estimatedProviderCostUsd: number | null;
  alerts: OperationsAlert[];
};

type OperationsJob = {
  id: string;
  capability: string;
  trigger: string;
  state: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  userName: string | null;
  userEmail: string;
  runAt: string;
  createdAt: string;
  updatedAt: string;
};

function ageLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3_600)}h`;
}

export function SageOperationsManager({
  initialSnapshot,
  initialJobs,
}: {
  initialSnapshot: OperationsSnapshot;
  initialJobs: OperationsJob[];
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [jobs, setJobs] = useState(initialJobs);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/admin/sage", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as {
      snapshot: OperationsSnapshot;
      jobs: OperationsJob[];
    };
    setSnapshot(data.snapshot);
    setJobs(data.jobs);
  }

  async function requeue(job: OperationsJob) {
    const reason = reasons[job.id]?.trim() ?? "";
    setBusyId(job.id);
    setError(null);
    try {
      const response = await fetch("/api/admin/sage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "requeue", jobId: job.id, reason }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Requeue failed");
      setReasons((current) => ({ ...current, [job.id]: "" }));
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Requeue failed",
      );
    } finally {
      setBusyId(null);
    }
  }

  const metricCards = [
    ["Pending", snapshot.counts.pending ?? 0],
    ["Running", snapshot.counts.running ?? 0],
    ["Dead letters", snapshot.counts.dead_letter ?? 0],
    ["Oldest pending", ageLabel(snapshot.oldestPendingAgeSeconds)],
    ["Provider failures", snapshot.recentProviderFailures],
    ["Average latency", `${snapshot.recentAverageLatencyMs}ms`],
  ];

  return (
    <div className="space-y-6">
      {snapshot.alerts.length ? (
        <section className="space-y-2" aria-label="Active alerts">
          {snapshot.alerts.map((alert) => (
            <p
              key={alert.key}
              className={`rounded-xl border px-4 py-3 text-sm ${
                alert.severity === "critical"
                  ? "border-danger/30 bg-danger/5 text-danger"
                  : "border-honey/60 bg-honey/10 text-matcha-deep"
              }`}
            >
              {alert.message}
            </p>
          ))}
        </section>
      ) : (
        <p className="rounded-xl border border-matcha-soft/40 bg-matcha-soft/10 px-4 py-3 text-sm text-matcha">
          No active Sage operations alerts.
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-line bg-white/65">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="font-[family-name:var(--font-fraunces)] text-lg font-semibold text-matcha-deep">
            Live operating pulse
          </h2>
          <p className="text-xs text-muted">
            Snapshot {new Date(snapshot.generatedAt).toLocaleTimeString()}
          </p>
        </div>
        <dl className="grid sm:grid-cols-2 lg:grid-cols-3">
          {metricCards.map(([label, value], index) => (
            <div
              key={label}
              className={`px-4 py-4 ${
                index > 0 ? "border-t border-line" : ""
              } ${index < 2 ? "sm:border-t-0" : ""} ${
                index % 2 ? "sm:border-l" : ""
              } ${index < 3 ? "lg:border-t-0" : "lg:border-t"} ${
                index % 3 ? "lg:border-l" : "lg:border-l-0"
              }`}
            >
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                {label}
              </dt>
              <dd className="mt-2 text-2xl font-semibold text-matcha-deep">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="surface-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
              Provider window
            </h2>
            <p className="mt-1 text-sm text-muted">
              Last 15 minutes: {snapshot.recentInputTokens.toLocaleString()} input
              tokens and {snapshot.recentOutputTokens.toLocaleString()} output
              tokens.
            </p>
            <p className="mt-1 text-xs text-muted">
              Estimated cost: {snapshot.estimatedProviderCostUsd === null
                ? "configure provider token rates"
                : `$${snapshot.estimatedProviderCostUsd.toFixed(6)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted"
          >
            Refresh
          </button>
        </div>
      </section>

      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          Active and recoverable jobs
        </h2>
        {jobs.length ? (
          jobs.map((job) => {
            const recoverable = ["failed", "dead_letter"].includes(job.state);
            return (
              <article key={job.id} className="surface-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{job.capability}</p>
                    <p className="mt-1 text-xs text-muted">
                      {job.userName || job.userEmail} · {job.trigger} · attempt {job.attempts} of {job.maxAttempts}
                    </p>
                  </div>
                  <span className="rounded-full border border-line bg-mist px-3 py-1 text-xs font-semibold text-muted">
                    {job.state.replaceAll("_", " ")}
                  </span>
                </div>
                {job.lastError ? (
                  <p className="mt-3 rounded-xl bg-mist p-3 text-sm text-muted">
                    {job.lastError}
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-muted">
                  Updated {new Date(job.updatedAt).toLocaleString()}
                </p>
                {recoverable ? (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={reasons[job.id] ?? ""}
                      onChange={(event) =>
                        setReasons((current) => ({
                          ...current,
                          [job.id]: event.target.value,
                        }))
                      }
                      maxLength={500}
                      placeholder="Why is this safe to requeue?"
                      className="field flex-1"
                    />
                    <button
                      type="button"
                      disabled={busyId === job.id || (reasons[job.id]?.trim().length ?? 0) < 3}
                      onClick={() => void requeue(job)}
                      className="rounded-xl bg-matcha-deep px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Requeue with audit
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })
        ) : (
          <p className="surface-card p-5 text-sm text-muted">
            No active or recoverable Sage jobs.
          </p>
        )}
      </section>
    </div>
  );
}
