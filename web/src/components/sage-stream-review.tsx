"use client";

import { useState } from "react";

type Stream = "activity" | "people" | "guests";

type SageJob = {
  id: string;
  state: string;
  result?: Record<string, unknown> | null;
  lastError?: string | null;
};

const STREAMS: Record<
  Stream,
  {
    capability: string;
    payload: Record<string, unknown>;
    label: string;
    working: string;
  }
> = {
  activity: {
    capability: "review_activity",
    payload: { pendingOnly: true, limit: 20 },
    label: "Ask Sage what needs attention",
    working: "Sage is reviewing your inbox and active coordination.",
  },
  people: {
    capability: "manage_connections",
    payload: { action: "review" },
    label: "Ask Sage to review my people",
    working: "Sage is reviewing connections and people you have met.",
  },
  guests: {
    capability: "run_guest_request",
    payload: { action: "list" },
    label: "Ask Sage to check guest requests",
    working: "Sage is checking your no-account requests and response counts.",
  },
};

function resultMessage(stream: Stream, result: Record<string, unknown> | null) {
  if (typeof result?.message === "string") return result.message;
  if (stream === "activity") {
    return `Sage found ${Number(result?.inboxCount ?? 0)} inbox items and ${Number(result?.sessionCount ?? 0)} active tasks.`;
  }
  if (stream === "people") {
    return `Sage found ${Number(result?.connectionCount ?? 0)} active connections, ${Number(result?.pendingCount ?? 0)} pending requests, and ${Number(result?.metCount ?? 0)} people from events.`;
  }
  return `Sage found ${Number(result?.taskCount ?? 0)} guest requests.`;
}

export function SageStreamReview({ stream }: { stream: Stream }) {
  const config = STREAMS[stream];
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function waitForJob(jobId: string) {
    for (let attempt = 0; attempt < 45; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const response = await fetch("/api/sage/jobs", { cache: "no-store" });
      if (!response.ok) continue;
      const data = (await response.json()) as { jobs?: SageJob[] };
      const job = data.jobs?.find((candidate) => candidate.id === jobId);
      if (!job || ["pending", "running"].includes(job.state)) continue;
      if (job.state === "completed") {
        setMessage(resultMessage(stream, job.result ?? null));
        return;
      }
      throw new Error(job.lastError ?? "Sage could not finish this review.");
    }
    setMessage("The review is saved and still running. You can safely leave this page.");
  }

  async function run() {
    setBusy(true);
    setError(null);
    setMessage(config.working);
    try {
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch("/api/sage/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          capability: config.capability,
          payload: config.payload,
          idempotencyKey,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        job?: SageJob;
      };
      if (!response.ok || !data.job) {
        throw new Error(data.error ?? "Sage could not start this review.");
      }
      if (data.job.state === "completed") {
        setMessage(resultMessage(stream, data.job.result ?? null));
      } else {
        await waitForJob(data.job.id);
      }
    } catch (caught) {
      setMessage(null);
      setError(caught instanceof Error ? caught.message : "Sage could not finish this review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[1rem] border border-matcha-soft/35 bg-matcha-soft/8 p-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
      <div>
        <p className="text-sm font-semibold text-matcha-deep">Sage can review this for you</p>
        {message ? (
          <p className="mt-1 text-sm leading-6 text-muted" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-1 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="button-secondary mt-3 w-full shrink-0 sm:mt-0 sm:w-auto"
        onClick={run}
        disabled={busy}
      >
        {busy ? "Sage is reviewing…" : config.label}
      </button>
    </div>
  );
}
