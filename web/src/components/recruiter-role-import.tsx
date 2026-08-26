"use client";

import { useState } from "react";
import type { HiringRoleDraft } from "@/lib/hiring-role-draft";

const FIELD_LABELS: Record<string, string> = {
  companyName: "Company",
  roleTitle: "Role title",
  candidateFacingSummary: "Role context",
  roleFocus: "Role family",
  level: "Seniority",
  employmentType: "Employment type",
  workMode: "Work mode",
  compensationMaximum: "Annual base ceiling",
  compensationCurrency: "Compensation currency",
  equityMaximumPercent: "Equity ceiling",
  sponsorshipAvailable: "Sponsorship",
  latestStart: "Start date",
  locationQueries: "Location mention",
  locations: "Canonical city",
};

type DraftResponse = {
  draft?: HiringRoleDraft;
  source?: {
    kind?: string;
    label?: string;
    warning?: string | null;
  };
  error?: string;
};

export function RecruiterRoleImport({
  onApply,
  omitMissingFields = [],
}: {
  onApply: (draft: HiringRoleDraft) => void;
  omitMissingFields?: string[];
}) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DraftResponse | null>(null);

  async function draftRole() {
    if (!sourceUrl.trim() && !description.trim()) {
      setError("Paste a job URL or job description first.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/hiring/role-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceUrl: sourceUrl.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as DraftResponse;
      if (!response.ok || !data.draft) {
        throw new Error(data.error ?? "Sage could not draft this role.");
      }
      setResult(data);
      onApply(data.draft);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Sage could not draft this role.",
      );
    } finally {
      setBusy(false);
    }
  }

  const extracted =
    result?.draft?.extractedFields.filter(
      (field) => field !== "candidateFacingSummary",
    ) ?? [];
  const missing =
    result?.draft?.missingFields.filter(
      (field) => !omitMissingFields.includes(field),
    ) ?? [];

  return (
    <section className="overflow-hidden rounded-3xl border border-matcha-soft/50 bg-[linear-gradient(145deg,rgba(23,63,46,0.99),rgba(38,82,60,0.96))] text-white shadow-[0_18px_46px_rgba(23,63,46,0.16)]">
      <div className="grid lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <div className="border-b border-white/12 p-5 sm:p-6 lg:border-r lg:border-b-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-honey-soft/30 bg-honey-soft/10 px-3 py-1 font-mono text-[0.68rem] font-bold tracking-[0.12em] text-honey-soft uppercase">
            <span aria-hidden="true">✦</span>
            Sage shortcut
          </div>
          <h3 className="mt-4 font-[family-name:var(--font-fraunces)] text-2xl font-semibold leading-tight">
            Start with the role you already have.
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/72">
            Sage turns a job page or description into a private hiring mandate.
            You confirm the terms; nothing is activated or sent from this step.
          </p>
          <div className="mt-5 flex items-center gap-3 text-xs font-semibold text-white/62">
            <span className="rounded-full border border-white/15 px-2.5 py-1">
              Source
            </span>
            <span aria-hidden="true">→</span>
            <span className="rounded-full border border-honey-soft/30 bg-honey-soft/10 px-2.5 py-1 text-honey-soft">
              Reviewable mandate
            </span>
          </div>
        </div>

        <div className="bg-white/[0.07] p-5 sm:p-6">
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold text-white">Job URL</span>
            <input
              type="text"
              inputMode="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://company.com/jobs/role"
              className="min-h-11 rounded-xl border border-white/20 bg-white px-3 text-ink outline-none placeholder:text-muted/70 focus:border-honey-soft focus:ring-3 focus:ring-honey-soft/15"
            />
          </label>
          <div className="my-3 flex items-center gap-3 text-[0.68rem] font-bold tracking-[0.12em] text-white/45 uppercase">
            <span className="h-px flex-1 bg-white/12" />
            or paste it
            <span className="h-px flex-1 bg-white/12" />
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold text-white">Job description</span>
            <textarea
              rows={5}
              maxLength={16_000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Paste the role, team, compensation, equity, and location details…"
              className="rounded-xl border border-white/20 bg-white px-3 py-2.5 text-ink outline-none placeholder:text-muted/70 focus:border-honey-soft focus:ring-3 focus:ring-honey-soft/15"
            />
          </label>
          <button
            type="button"
            onClick={draftRole}
            disabled={busy || (!sourceUrl.trim() && !description.trim())}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-honey px-4 text-sm font-bold text-matcha-deep transition hover:bg-honey-soft disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
          >
            {busy ? "Sage is reading the role…" : "Draft the hiring mandate"}
          </button>
          <p className="mt-2 text-[0.68rem] leading-5 text-white/48">
            Job text is used to draft this form. It is not posted or sent to a
            candidate from here.
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-red-200/25 bg-red-950/20 px-3 py-2 text-sm text-red-50"
            >
              {error}
            </p>
          ) : null}
          {result?.draft ? (
            <div
              role="status"
              className="mt-4 rounded-2xl border border-white/15 bg-white/10 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-white">
                    Draft applied below
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-white/62">
                    Sage found {extracted.length} structured term
                    {extracted.length === 1 ? "" : "s"}. Review them before
                    activation.
                  </p>
                </div>
                {result.source?.label ? (
                  <span
                    title={result.source.label}
                    className="max-w-48 truncate rounded-full border border-white/15 px-2.5 py-1 text-[0.68rem] font-semibold text-white/65"
                  >
                    {result.source.label}
                  </span>
                ) : null}
              </div>
              {extracted.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {extracted.map((field) => (
                    <span
                      key={field}
                      className="rounded-full bg-white/12 px-2.5 py-1 text-[0.68rem] font-semibold text-white/78"
                    >
                      {FIELD_LABELS[field] ?? field}
                    </span>
                  ))}
                </div>
              ) : null}
              {missing.length ? (
                <p className="mt-3 text-xs leading-5 text-honey-soft">
                  <span className="font-bold">Still needed:</span>{" "}
                  {missing
                    .map((field) => FIELD_LABELS[field] ?? field)
                    .join(", ")}
                  .
                </p>
              ) : null}
              {result.draft.locationQueries.length ? (
                <p className="mt-2 text-xs leading-5 text-white/67">
                  Location mentioned: {result.draft.locationQueries.join(", ")}.
                  Choose the canonical city suggestion below; Sage will not
                  guess the place.
                </p>
              ) : null}
              {result.source?.warning ? (
                <p className="mt-2 text-xs leading-5 text-white/67">
                  {result.source.warning}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
