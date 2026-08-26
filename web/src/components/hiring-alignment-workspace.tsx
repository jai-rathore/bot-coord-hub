"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
  formatHiringMoney,
} from "@/lib/hiring-options";

type AlignmentResponse = {
  alignment?: string;
  verdict?: string;
  note?: string;
  nextStep?: string;
  gaps?: Array<{
    dimension?: string;
    message?: string;
    recruiterCanAdjust?: boolean;
  }>;
  shareableExpectations?: Record<string, unknown>;
};

export type HiringAlignmentItem = {
  task: {
    publicId: string;
    title: string;
    description: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
    config: Record<string, unknown>;
  };
  offer: Record<string, unknown>;
  latestAlignment: {
    id: string;
    response: Record<string, unknown>;
    createdAt: string;
  } | null;
};

function list(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) =>
          item && typeof item === "object" && !Array.isArray(item)
            ? String((item as Record<string, unknown>).label ?? "")
            : String(item),
        )
        .filter(Boolean)
        .join(", ")
    : "";
}

function alignmentLabel(value: string | undefined) {
  switch (value) {
    case "ready_for_intro":
      return "Ready for a human introduction";
    case "aligned":
      return "Terms align";
    case "revisable":
      return "A revision could unlock this";
    case "not_aligned":
      return "Not aligned";
    default:
      return "Needs more information";
  }
}

function formatExpectation(
  key: string,
  value: unknown,
  expectations: Record<string, unknown>,
) {
  if (key === "compensationMinimum") {
    return formatHiringMoney(value, expectations.compensationCurrency);
  }
  if (key === "locationRadiusMiles") {
    return Number(value) === 0 ? "Selected cities only" : `Within ${value} miles`;
  }
  if (Array.isArray(value)) return list(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function HiringAlignmentCard({ item }: { item: HiringAlignmentItem }) {
  const router = useRouter();
  const alignment = (item.latestAlignment?.response ?? null) as AlignmentResponse | null;
  const [compensationMaximum, setCompensationMaximum] = useState(
    item.offer.compensationMaximum == null
      ? ""
      : String(item.offer.compensationMaximum),
  );
  const [compensationCurrency, setCompensationCurrency] = useState(
    typeof item.offer.compensationCurrency === "string"
      ? item.offer.compensationCurrency
      : "USD",
  );
  const [equityMaximumPercent, setEquityMaximumPercent] = useState(
    item.offer.equityMaximumPercent == null
      ? ""
      : String(item.offer.equityMaximumPercent),
  );
  const [locations, setLocations] = useState<CanonicalLocationSuggestion[]>([]);
  const [locationRadiusMiles, setLocationRadiusMiles] = useState(
    item.offer.locationRadiusMiles == null
      ? "25"
      : String(item.offer.locationRadiusMiles),
  );
  const [workMode, setWorkMode] = useState(
    Array.isArray(item.offer.workModes) ? String(item.offer.workModes[0] ?? "") : "",
  );
  const [employmentType, setEmploymentType] = useState(
    Array.isArray(item.offer.employmentTypes)
      ? String(item.offer.employmentTypes[0] ?? "")
      : "",
  );
  const [level, setLevel] = useState(
    Array.isArray(item.offer.levels) ? String(item.offer.levels[0] ?? "") : "",
  );
  const [roleFocus, setRoleFocus] = useState(
    Array.isArray(item.offer.roleFocus) ? String(item.offer.roleFocus[0] ?? "") : "",
  );
  const [candidateFacingUpdate, setCandidateFacingUpdate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revise(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    const privateConfig: Record<string, unknown> = {};
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
    if (level) privateConfig.levels = [level];
    if (roleFocus) privateConfig.roleFocus = [roleFocus];

    try {
      const response = await fetch(
        `/api/hiring/tasks/${encodeURIComponent(item.task.publicId)}/revise`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ privateConfig, candidateFacingUpdate }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Could not revise the role terms.");
      }
      setMessage(
        data.alignment?.alignment === "ready_for_intro"
          ? "The revised terms align. Ask both people for the final yes."
          : "Terms updated and the candidate's agent was informed when available.",
      );
      setCandidateFacingUpdate("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not revise the role terms.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="surface-card overflow-hidden">
      <div className="grid gap-5 border-b border-line p-5 sm:grid-cols-[1fr_auto] sm:items-start sm:p-6">
        <div>
          <p className="text-xs font-bold tracking-[0.1em] text-matcha uppercase">
            {String(item.offer.companyName ?? "Hiring alignment")}
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
            {item.task.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            {alignment?.note ?? "Waiting for the candidate or their agent to respond."}
          </p>
        </div>
        <span
          className={`inline-flex w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${
            alignment?.alignment === "ready_for_intro"
              ? "border-matcha-soft bg-matcha-soft/12 text-matcha-deep"
              : alignment?.alignment === "revisable"
                ? "border-honey/50 bg-honey-soft/25 text-matcha-deep"
                : "border-line bg-white text-muted"
          }`}
        >
          {alignment ? alignmentLabel(alignment.alignment) : "Awaiting response"}
        </span>
      </div>

      {alignment ? (
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold tracking-[0.1em] text-matcha uppercase">
              Alignment memo
            </p>
            {alignment.gaps?.length ? (
              <ul className="mt-3 space-y-3">
                {alignment.gaps.map((gap, index) => (
                  <li key={`${gap.dimension}-${index}`} className="flex gap-3 text-sm leading-6">
                    <span className="mt-1 text-honey" aria-hidden="true">●</span>
                    <span>
                      <span className="block text-ink">{gap.message}</span>
                      <span className="text-xs text-muted">
                        {gap.recruiterCanAdjust ? "Recruiter-adjustable" : "Respect this signal"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-matcha-deep">
                No submitted hard constraint is currently mismatched.
              </p>
            )}
            <p className="mt-4 border-t border-line pt-4 text-sm font-medium leading-6 text-matcha-deep">
              {alignment.nextStep}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold tracking-[0.1em] text-matcha uppercase">
              Candidate-approved detail
            </p>
            {alignment.shareableExpectations &&
            Object.keys(alignment.shareableExpectations).length ? (
              <dl className="mt-3 space-y-2">
                {Object.entries(alignment.shareableExpectations).map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[8.5rem_1fr] gap-3 text-sm">
                    <dt className="text-muted">
                      {key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                    </dt>
                    <dd className="font-medium text-ink">
                      {formatExpectation(
                        key,
                        value,
                        alignment.shareableExpectations!,
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted">
                The candidate chose gap-only sharing. Their submitted values remain encrypted.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <details className="border-t border-line p-5 sm:p-6">
        <summary className="cursor-pointer text-sm font-semibold text-matcha-deep">
          Revise the role terms
        </summary>
        <form onSubmit={revise} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">Maximum annual base compensation</span>
            <span className="grid grid-cols-[7rem_1fr] overflow-hidden rounded-xl border border-line bg-white">
              <select aria-label="Compensation currency" className="border-r border-line bg-mist/55 px-2 text-sm font-semibold outline-none" value={compensationCurrency} onChange={(event) => setCompensationCurrency(event.target.value)}>
                {HIRING_CURRENCIES.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
              </select>
              <input className="min-h-11 min-w-0 px-3 outline-none" type="number" min={1} max={10_000_000} step={1_000} value={compensationMaximum} onChange={(event) => setCompensationMaximum(event.target.value)} />
            </span>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">Equity ceiling (%)</span>
            <input className="field" type="number" min={0} max={100} step="0.001" value={equityMaximumPercent} onChange={(event) => setEquityMaximumPercent(event.target.value)} />
          </label>
          <div className="grid gap-3 rounded-xl border border-line bg-white/55 p-4 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-end">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">Replace role location</span>
              <span className="text-xs text-muted">Current: {list(item.offer.locations) || "Not specified"}</span>
              <LocationAutocomplete granularity="city" multiple label="Revised role location cities" selected={locations} onChange={setLocations} />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">Role vicinity</span>
              <select className="field" value={locationRadiusMiles} onChange={(event) => setLocationRadiusMiles(event.target.value)}>
                {HIRING_RADIUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">Work mode</span>
            <select className="field" value={workMode} onChange={(event) => setWorkMode(event.target.value)}>
              <option value="">Not specified</option>
              {HIRING_WORK_MODES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">Employment type</span>
            <select className="field" value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}>
              <option value="">Not specified</option>
              {HIRING_EMPLOYMENT_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">Seniority</span>
            <select className="field" value={level} onChange={(event) => setLevel(event.target.value)}>
              <option value="">Not specified</option>
              {HIRING_LEVELS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">Role family</span>
            <select className="field" value={roleFocus} onChange={(event) => setRoleFocus(event.target.value)}>
              <option value="">Not specified</option>
              {HIRING_ROLE_FAMILIES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="font-medium text-ink">What changed?</span>
            <textarea className="field" rows={3} maxLength={1_000} value={candidateFacingUpdate} onChange={(event) => setCandidateFacingUpdate(event.target.value)} placeholder="We increased the equity range and broadened the role scope." />
          </label>
          {message ? <p role="status" className="text-sm font-medium text-matcha-deep sm:col-span-2">{message}</p> : null}
          {error ? <p role="alert" className="text-sm font-medium text-danger sm:col-span-2">{error}</p> : null}
          <div className="sm:col-span-2">
            <button type="submit" className="button-primary" disabled={busy}>
              {busy ? "Re-checking…" : "Update terms and re-check alignment"}
            </button>
          </div>
        </form>
      </details>
    </article>
  );
}

export function HiringAlignmentWorkspace({
  items,
}: {
  items: HiringAlignmentItem[];
}) {
  if (!items.length) {
    return (
      <p className="rounded-2xl border border-dashed border-matcha-soft/45 bg-white/45 p-6 text-sm leading-6 text-muted">
        No alignment memos yet. Create one below instead of sending another open-ended cold message.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <HiringAlignmentCard key={item.task.publicId} item={item} />
      ))}
    </div>
  );
}
