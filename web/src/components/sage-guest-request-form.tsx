"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LocationAutocomplete,
  type CanonicalLocationSuggestion,
} from "@/components/location-autocomplete";
import {
  HIRING_CURRENCIES,
  HIRING_EMPLOYMENT_TYPES,
  HIRING_LEVELS,
  HIRING_RADIUS_OPTIONS,
  HIRING_ROLE_FAMILIES,
  HIRING_WORK_MODES,
} from "@/lib/hiring-options";

type SageJob = {
  id: string;
  state: string;
  result?: Record<string, unknown> | null;
  lastError?: string | null;
};

export function SageGuestRequestForm({
  targetHandle,
  targetName,
}: {
  targetHandle?: string;
  targetName?: string;
} = {}) {
  const router = useRouter();
  const [candidateEmail, setCandidateEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [compensationMaximum, setCompensationMaximum] = useState("");
  const [compensationCurrency, setCompensationCurrency] = useState("USD");
  const [equityMaximumPercent, setEquityMaximumPercent] = useState("");
  const [locations, setLocations] = useState<CanonicalLocationSuggestion[]>([]);
  const [locationRadiusMiles, setLocationRadiusMiles] = useState("25");
  const [workMode, setWorkMode] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [sponsorship, setSponsorship] = useState("");
  const [latestStart, setLatestStart] = useState("");
  const [level, setLevel] = useState("");
  const [roleFocus, setRoleFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guestUrl, setGuestUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [publicId, setPublicId] = useState<string | null>(null);
  const [notifying, setNotifying] = useState(false);

  function finish(job: SageJob) {
    const url =
      typeof job.result?.guestUrl === "string" ? job.result.guestUrl : null;
    if (job.state !== "completed" || !url) {
      throw new Error(job.lastError ?? "Sage could not create the request.");
    }
    setGuestUrl(url);
    setPublicId(
      typeof job.result?.publicId === "string" ? job.result.publicId : null,
    );
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
    if (companyName) privateConfig.companyName = companyName;
    if (title) privateConfig.roleTitle = title;
    if (compensationMaximum) {
      privateConfig.compensationMaximum = Number(compensationMaximum);
      privateConfig.compensationCurrency = compensationCurrency;
    }
    if (equityMaximumPercent) {
      privateConfig.equityMaximumPercent = Number(equityMaximumPercent);
    }
    if (locations.length) {
      privateConfig.locations = locations.map(
        (location) => location.resolutionToken,
      );
      privateConfig.locationRadiusMiles = Number(locationRadiusMiles);
    }
    if (workMode) privateConfig.workModes = [workMode];
    if (employmentType) privateConfig.employmentTypes = [employmentType];
    if (sponsorship) {
      privateConfig.sponsorshipAvailable = sponsorship === "yes";
    }
    if (latestStart) privateConfig.latestStart = latestStart;
    if (level) privateConfig.levels = [level];
    if (roleFocus) privateConfig.roleFocus = [roleFocus];

    try {
      const idempotencyKey = crypto.randomUUID();
      if (targetHandle) {
        const response = await fetch("/api/hiring/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetHandle,
            title,
            description: description || undefined,
            privateConfig,
            idempotencyKey,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          publicId?: string;
        };
        if (!response.ok) {
          throw new Error(
            data.error ?? "Could not send this role to the candidate's agent.",
          );
        }
        setPublicId(data.publicId ?? null);
        setMessage(
          data.message ??
            "The candidate's agent has the role and will return only approved alignment information.",
        );
        router.refresh();
        return;
      }
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
      router.refresh();
    } catch (caught) {
      setMessage(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Sage could not create the request.",
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

  async function notifyCandidateAgent() {
    if (!publicId) return;
    setNotifying(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/hiring/tasks/${encodeURIComponent(publicId)}/notify`,
        { method: "POST" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.error ?? "Could not notify the candidate's agent.",
        );
      }
      setMessage(data.message ?? "The candidate's agent has the request.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not notify the candidate's agent.",
      );
    } finally {
      setNotifying(false);
    }
  }

  return (
    <section
      className="surface-card p-5 sm:p-6"
      aria-labelledby="sage-hiring-title"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-matcha">
        {targetHandle
          ? `Private role brief for ${targetName ?? `@${targetHandle}`}`
          : "No account required for the candidate"}
      </p>
      <h2
        id="sage-hiring-title"
        className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep"
      >
        {targetHandle
          ? `Let the agents check fit before you ask ${targetName ?? "them"} for time`
          : "Start a private recruiting alignment"}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        {targetHandle
          ? `Send the actual role terms once. ${targetName ?? "The candidate"}'s agent can compare them privately, return approved gaps, and invite a revision without exposing their full criteria.`
          : "Share the role once. The candidate or their agent can return approved expectations, you can improve the terms, and HoneyMatcha re-checks alignment before either person commits to a call."}
      </p>

      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        {!targetHandle ? (
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
        ) : null}
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Company</span>
          <input
            required
            maxLength={120}
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            placeholder="Acme"
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
          <span className="font-medium text-ink">
            Maximum annual base compensation
          </span>
          <span className="grid grid-cols-[7rem_1fr] overflow-hidden rounded-xl border border-line bg-white focus-within:border-matcha-soft focus-within:ring-3 focus-within:ring-matcha/10">
            <select
              aria-label="Compensation currency"
              value={compensationCurrency}
              onChange={(event) => setCompensationCurrency(event.target.value)}
              className="border-r border-line bg-mist/55 px-2 text-sm font-semibold outline-none"
            >
              {HIRING_CURRENCIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={10_000_000}
              step={1_000}
              inputMode="numeric"
              value={compensationMaximum}
              onChange={(event) => setCompensationMaximum(event.target.value)}
              placeholder="200,000"
              className="min-h-11 min-w-0 px-3 outline-none"
            />
          </span>
          <span className="text-xs text-muted">
            Annual base, before bonus or equity.
          </span>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Equity ceiling (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            step="0.001"
            value={equityMaximumPercent}
            onChange={(event) => setEquityMaximumPercent(event.target.value)}
            placeholder="0.25"
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
          <span className="font-medium text-ink">Role family</span>
          <select
            value={roleFocus}
            onChange={(event) => setRoleFocus(event.target.value)}
            className="field"
          >
            <option value="">Choose a function</option>
            {HIRING_ROLE_FAMILIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Seniority</span>
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            className="field"
          >
            <option value="">Choose a level</option>
            {HIRING_LEVELS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Employment type</span>
          <select
            value={employmentType}
            onChange={(event) => setEmploymentType(event.target.value)}
            className="field"
          >
            <option value="">Choose a type</option>
            {HIRING_EMPLOYMENT_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Work mode</span>
          <select
            value={workMode}
            onChange={(event) => setWorkMode(event.target.value)}
            className="field"
          >
            <option value="">Choose a mode</option>
            {HIRING_WORK_MODES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
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
        <div className="grid gap-4 rounded-2xl border border-line bg-white/55 p-4 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-end">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">Role location cities</span>
            <LocationAutocomplete
              granularity="city"
              multiple
              label="Role location cities"
              selected={locations}
              onChange={setLocations}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">Role vicinity</span>
            <select
              value={locationRadiusMiles}
              onChange={(event) => setLocationRadiusMiles(event.target.value)}
              className="field"
            >
              {HIRING_RADIUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs leading-5 text-muted sm:col-span-2">
            Select canonical cities so nearby-area matching is consistent.
            Remote remains a separate work mode.
          </p>
        </div>

        {message ? (
          <p
            className="text-sm font-medium leading-6 text-matcha-deep sm:col-span-2"
            role="status"
          >
            {message}
          </p>
        ) : null}
        {error ? (
          <p
            className="text-sm font-medium text-danger sm:col-span-2"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {guestUrl ? (
          <div className="rounded-xl border border-line bg-white/70 p-3 sm:col-span-2">
            <p className="break-all text-xs text-muted">{guestUrl}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="button-secondary"
                onClick={copyLink}
              >
                {copied ? "Copied" : "Copy private candidate link"}
              </button>
              {publicId ? (
                <button
                  type="button"
                  className="button-primary"
                  onClick={notifyCandidateAgent}
                  disabled={notifying}
                >
                  {notifying ? "Checking…" : "Send to candidate's agent"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="sm:col-span-2">
          <button type="submit" className="button-primary" disabled={busy}>
            {busy
              ? targetHandle
                ? "Sending to their agent…"
                : "Sage is preparing it…"
              : targetHandle
                ? "Send role to candidate's agent"
                : "Ask Sage to create the private link"}
          </button>
        </div>
      </form>
    </section>
  );
}
