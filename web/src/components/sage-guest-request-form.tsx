"use client";

import { useState } from "react";

type SageJob = {
  id: string;
  state: string;
  result?: Record<string, unknown> | null;
  lastError?: string | null;
};

function list(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function SageGuestRequestForm() {
  const [candidateEmail, setCandidateEmail] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [compensationMaximum, setCompensationMaximum] = useState("");
  const [locations, setLocations] = useState("");
  const [workModes, setWorkModes] = useState("");
  const [sponsorship, setSponsorship] = useState("");
  const [latestStart, setLatestStart] = useState("");
  const [levels, setLevels] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guestUrl, setGuestUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function finish(job: SageJob) {
    const url =
      typeof job.result?.guestUrl === "string" ? job.result.guestUrl : null;
    if (job.state !== "completed" || !url) {
      throw new Error(job.lastError ?? "Sage could not create the request.");
    }
    setGuestUrl(url);
    setMessage(
      "Sage created the private request. HoneyMatcha has not contacted the candidate. Copy the link and send it yourself.",
    );
  }

  async function waitForJob(jobId: string) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const response = await fetch("/api/sage/jobs", { cache: "no-store" });
      if (!response.ok) continue;
      const data = (await response.json()) as { jobs?: SageJob[] };
      const job = data.jobs?.find((candidate) => candidate.id === jobId);
      if (!job || ["pending", "running"].includes(job.state)) continue;
      finish(job);
      return;
    }
    setMessage(
      "The request is saved and still running. Check Activity before creating another one.",
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setGuestUrl(null);
    setCopied(false);
    setMessage("Sage is preparing the private compatibility request.");

    const privateConfig: Record<string, unknown> = {};
    if (compensationMaximum) {
      privateConfig.compensationMaximum = Number(compensationMaximum);
    }
    if (list(locations).length) privateConfig.locations = list(locations);
    if (list(workModes).length) privateConfig.workModes = list(workModes);
    if (sponsorship) {
      privateConfig.sponsorshipAvailable = sponsorship === "yes";
    }
    if (latestStart) privateConfig.latestStart = latestStart;
    if (list(levels).length) privateConfig.levels = list(levels);

    try {
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch("/api/sage/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          capability: "run_guest_request",
          payload: {
            action: "create",
            taskType: "hiring_compatibility",
            title,
            description: description || undefined,
            targetEmail: candidateEmail,
            privateConfig,
            expiresInMinutes: 7 * 24 * 60,
            maxResponses: 1,
          },
          idempotencyKey,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        job?: SageJob;
      };
      if (!response.ok || !data.job) {
        throw new Error(data.error ?? "Sage could not start this request.");
      }
      if (data.job.state === "completed") finish(data.job);
      else await waitForJob(data.job.id);
    } catch (caught) {
      setMessage(null);
      setError(
        caught instanceof Error ? caught.message : "Sage could not create the request.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!guestUrl) return;
    await navigator.clipboard.writeText(guestUrl);
    setCopied(true);
  }

  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby="sage-hiring-title">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-matcha">
        No account required for the candidate
      </p>
      <h2
        id="sage-hiring-title"
        className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep"
      >
        Ask Sage for a private hiring check
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        Set the role constraints, then share one private link. You receive only
        compatibility by dimension. The candidate&apos;s compensation, location,
        sponsorship, timing, and level answers are never shown to you.
      </p>

      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Candidate email</span>
          <input
            type="email"
            required
            value={candidateEmail}
            onChange={(event) => setCandidateEmail(event.target.value)}
            className="field"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Role title</span>
          <input
            required
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Senior product engineer"
            className="field"
          />
        </label>
        <label className="grid gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-ink">Candidate-facing context</span>
          <textarea
            rows={3}
            maxLength={2_000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="A short description of the role and team"
            className="field"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Compensation ceiling</span>
          <input
            type="number"
            min={1}
            max={10_000_000}
            value={compensationMaximum}
            onChange={(event) => setCompensationMaximum(event.target.value)}
            placeholder="200000"
            className="field"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Sponsorship available</span>
          <select
            value={sponsorship}
            onChange={(event) => setSponsorship(event.target.value)}
            className="field"
          >
            <option value="">Not specified</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Locations</span>
          <input
            value={locations}
            onChange={(event) => setLocations(event.target.value)}
            placeholder="San Francisco, New York"
            className="field"
          />
          <span className="text-xs text-muted">Separate options with commas.</span>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Work modes</span>
          <input
            value={workModes}
            onChange={(event) => setWorkModes(event.target.value)}
            placeholder="Remote, Hybrid"
            className="field"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Latest acceptable start</span>
          <input
            type="date"
            value={latestStart}
            onChange={(event) => setLatestStart(event.target.value)}
            className="field"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Levels</span>
          <input
            value={levels}
            onChange={(event) => setLevels(event.target.value)}
            placeholder="Senior, Staff"
            className="field"
          />
        </label>

        {message ? (
          <p className="text-sm font-medium leading-6 text-matcha-deep sm:col-span-2" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm font-medium text-danger sm:col-span-2" role="alert">
            {error}
          </p>
        ) : null}
        {guestUrl ? (
          <div className="rounded-xl border border-line bg-white/70 p-3 sm:col-span-2">
            <p className="break-all text-xs text-muted">{guestUrl}</p>
            <button type="button" className="button-secondary mt-3" onClick={copyLink}>
              {copied ? "Copied" : "Copy private candidate link"}
            </button>
          </div>
        ) : null}

        <div className="sm:col-span-2">
          <button type="submit" className="button-primary" disabled={busy}>
            {busy ? "Sage is preparing it…" : "Ask Sage to create the private link"}
          </button>
        </div>
      </form>
    </section>
  );
}
