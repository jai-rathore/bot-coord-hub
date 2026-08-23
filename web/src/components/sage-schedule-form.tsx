"use client";

import Link from "next/link";
import { useState } from "react";

type PublicSageJob = {
  id: string;
  state: string;
  result?: Record<string, unknown> | null;
  lastError?: string | null;
};

function localInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function initialWindow(daysFromNow: number) {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60_000);
  date.setMinutes(0, 0, 0);
  return localInputValue(date);
}

function jobMessage(job: PublicSageJob): string {
  if (job.state === "pending" || job.state === "running") {
    return "Sage is comparing the scheduling constraints now.";
  }
  if (job.state === "waiting_human") {
    return "Sage created the coordination task. It is waiting for the people involved to connect calendars or approve a proposed time.";
  }
  if (job.state === "completed") return "Sage completed this scheduling task.";
  if (job.state === "failed" || job.state === "dead_letter") {
    return job.lastError ?? "Sage could not complete this request.";
  }
  return `Sage task status: ${job.state}.`;
}

export function SageScheduleForm() {
  const [peerEmails, setPeerEmails] = useState("");
  const [title, setTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [windowStart, setWindowStart] = useState(() => initialWindow(1));
  const [windowEnd, setWindowEnd] = useState(() => initialWindow(8));
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [job, setJob] = useState<PublicSageJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshJob(jobId: string) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const response = await fetch("/api/sage/jobs", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { jobs?: PublicSageJob[] };
      const next = data.jobs?.find((candidate) => candidate.id === jobId);
      if (!next) return;
      setJob(next);
      if (!["pending", "running"].includes(next.state)) return;
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setJob(null);
    const emails = peerEmails
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    try {
      const response = await fetch("/api/sage/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          capability: "schedule_meeting",
          payload: {
            peerEmails: emails,
            title,
            durationMinutes: Number(durationMinutes),
            windowStart: new Date(windowStart).toISOString(),
            windowEnd: new Date(windowEnd).toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            notes,
          },
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        job?: PublicSageJob;
      };
      if (!response.ok || !data.job) {
        throw new Error(data.error ?? "Sage could not start this request");
      }
      setJob(data.job);
      void refreshJob(data.job.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  const sessionId =
    job?.result && typeof job.result.sessionId === "string"
      ? job.result.sessionId
      : null;

  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby="ask-sage-title">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-matcha">
        Sage capability
      </p>
      <h2
        id="ask-sage-title"
        className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep"
      >
        Ask Sage to schedule
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        Sage compares free/busy information and proposes times. It cannot approve
        or book until every required person confirms.
      </p>

      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-ink">Who should Sage coordinate with?</span>
          <input
            value={peerEmails}
            onChange={(event) => setPeerEmails(event.target.value)}
            required
            placeholder="alex@example.com, sam@example.com"
            className="rounded-md border border-line bg-white px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-matcha"
          />
          <span className="text-xs text-muted">Separate multiple emails with commas.</span>
        </label>
        <label className="grid gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-ink">Meeting title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={120}
            placeholder="Catch up"
            className="rounded-md border border-line bg-white px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-matcha"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Search from</span>
          <input
            type="datetime-local"
            value={windowStart}
            onChange={(event) => setWindowStart(event.target.value)}
            required
            className="rounded-md border border-line bg-white px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-matcha"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Search until</span>
          <input
            type="datetime-local"
            value={windowEnd}
            onChange={(event) => setWindowEnd(event.target.value)}
            required
            className="rounded-md border border-line bg-white px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-matcha"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Length</span>
          <select
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
            className="rounded-md border border-line bg-white px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-matcha"
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
            <option value="60">60 minutes</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-ink">Notes for Sage (optional)</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={2_000}
            rows={3}
            className="rounded-md border border-line bg-white px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-matcha"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="button-primary cursor-pointer disabled:opacity-60"
          >
            {pending ? "Giving Sage the task…" : "Ask Sage"}
          </button>
        </div>
      </form>

      {error ? (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {job ? (
        <div role="status" aria-live="polite" className="mt-4 border-t border-line pt-4">
          <p className="text-sm font-medium text-ink">{jobMessage(job)}</p>
          {sessionId ? (
            <Link
              href={`/app/activity?session=${sessionId}`}
              className="mt-2 inline-block text-sm font-semibold"
            >
              Open the coordination task
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
