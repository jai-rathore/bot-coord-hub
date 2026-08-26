"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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

type EnrollmentReview = {
  claims: {
    public: Record<string, unknown>;
    private: Record<string, unknown>;
    disclosureAfterMatch: Record<string, unknown>;
  };
};

export type HiringEnrollment = {
  id: string | null;
  status: string;
  ownerReview: EnrollmentReview | null;
};

function firstString(value: unknown) {
  if (Array.isArray(value)) {
    return value.find((item): item is string => typeof item === "string") ?? "";
  }
  return typeof value === "string" ? value : "";
}

function savedLocations(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      typeof (item as Record<string, unknown>).label === "string"
    ) {
      return [String((item as Record<string, unknown>).label)];
    }
    return [];
  });
}

function valueAsString(value: unknown, fallback = "") {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value;
  return fallback;
}

function ChoiceCard({
  selected,
  title,
  detail,
  onClick,
}: {
  selected: boolean;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-28 rounded-2xl border p-4 text-left transition sm:p-5 ${
        selected
          ? "border-matcha bg-matcha-deep text-white shadow-[0_14px_34px_rgba(23,63,46,0.18)]"
          : "border-line bg-white/75 text-ink hover:border-matcha-soft hover:bg-white"
      }`}
    >
      <span className="block text-base font-semibold">{title}</span>
      <span
        className={`mt-1.5 block text-sm leading-6 ${
          selected ? "text-white/75" : "text-muted"
        }`}
      >
        {detail}
      </span>
    </button>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <select
        className="field"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function HiringProfileForm({
  intentSlug = "hiring_compatibility",
  enrollment,
  onSaved,
}: {
  intentSlug?: string;
  enrollment: HiringEnrollment;
  onSaved?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const saved = useMemo(() => {
    const review = enrollment.ownerReview;
    return review
      ? {
          ...review.claims.public,
          ...review.claims.private,
          ...review.claims.disclosureAfterMatch,
        }
      : {};
  }, [enrollment.ownerReview]);
  const initialMode =
    saved.participantType === "candidate" || saved.participantType === "employer"
      ? saved.participantType
      : "";
  const [mode, setMode] = useState<"" | "candidate" | "employer">(
    initialMode,
  );
  const [roleFamily, setRoleFamily] = useState(firstString(saved.roleFocus));
  const [level, setLevel] = useState(firstString(saved.levels));
  const [employmentType, setEmploymentType] = useState(
    firstString(saved.employmentTypes),
  );
  const [workMode, setWorkMode] = useState(firstString(saved.workModes));
  const [currency, setCurrency] = useState(
    valueAsString(saved.compensationCurrency, "USD"),
  );
  const [compensation, setCompensation] = useState(
    valueAsString(
      initialMode === "employer"
        ? saved.compensationMaximum
        : saved.compensationMinimum,
    ),
  );
  const [equity, setEquity] = useState(
    valueAsString(
      initialMode === "employer"
        ? saved.equityMaximumPercent
        : saved.equityMinimumPercent,
    ),
  );
  const [sponsorship, setSponsorship] = useState(() => {
    const value =
      initialMode === "employer"
        ? saved.sponsorshipAvailable
        : saved.sponsorshipRequired;
    return typeof value === "boolean" ? String(value) : "";
  });
  const [startDate, setStartDate] = useState(
    valueAsString(
      initialMode === "employer" ? saved.latestStart : saved.earliestStart,
    ).slice(0, 10),
  );
  const [radiusMiles, setRadiusMiles] = useState(
    valueAsString(saved.locationRadiusMiles, "25"),
  );
  const [introductionSummary, setIntroductionSummary] = useState(
    valueAsString(saved.introductionSummary),
  );
  const [locations, setLocations] = useState<CanonicalLocationSuggestion[]>([]);
  const [clearExistingLocations, setClearExistingLocations] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const existingLocations = savedLocations(saved.locations);

  function chooseMode(next: "candidate" | "employer") {
    if (mode !== next) {
      setCompensation("");
      setEquity("");
      setSponsorship("");
      setStartDate("");
    }
    setMode(next);
    setMessage(null);
    setError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!mode) {
      setError("Choose whether you are looking for a job or hiring someone.");
      return;
    }
    if (!workMode) {
      setError("Choose a work mode.");
      return;
    }
    if (
      workMode !== "Remote" &&
      !locations.length &&
      (!existingLocations.length || clearExistingLocations)
    ) {
      setError("Choose at least one city for hybrid or onsite work.");
      return;
    }

    setBusy(true);
    setMessage(null);
    setError(null);
    const headline =
      mode === "candidate"
        ? `${level || "Open"} ${roleFamily || "professional"} candidate`
        : `Hiring ${level ? `${level} ` : ""}${roleFamily || "professional talent"}`;
    const claims: Record<string, unknown> = {
      participantType: mode,
      headline,
      roleFocus: roleFamily ? [roleFamily] : null,
      levels: level ? [level] : null,
      employmentTypes: employmentType ? [employmentType] : null,
      workModes: workMode ? [workMode] : null,
      compensationCurrency: compensation ? currency : null,
      locationRadiusMiles: Number(radiusMiles),
      introductionSummary: introductionSummary.trim() || null,
      ...(mode === "candidate"
        ? {
            compensationMinimum: compensation ? Number(compensation) : null,
            equityMinimumPercent: equity ? Number(equity) : null,
            sponsorshipRequired:
              sponsorship === "" ? null : sponsorship === "true",
            earliestStart: startDate || null,
            compensationMaximum: null,
            equityMaximumPercent: null,
            sponsorshipAvailable: null,
            latestStart: null,
          }
        : {
            compensationMaximum: compensation ? Number(compensation) : null,
            equityMaximumPercent: equity ? Number(equity) : null,
            sponsorshipAvailable:
              sponsorship === "" ? null : sponsorship === "true",
            latestStart: startDate || null,
            compensationMinimum: null,
            equityMinimumPercent: null,
            sponsorshipRequired: null,
            earliestStart: null,
          }),
    };
    if (locations.length) {
      claims.locations = locations.map((location) => location.resolutionToken);
    } else if (clearExistingLocations) {
      claims.locations = null;
    }

    try {
      const response = await fetch("/api/discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "submit_enrollment",
          intentSlug,
          claims,
          provenance: {},
          requestActivation: true,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not save your recruiting profile.");
      }
      setMessage(
        mode === "candidate"
          ? "Your private job preferences are active. HoneyMatcha can now look for aligned roles."
          : "Your private hiring criteria are active. HoneyMatcha can now look for aligned candidates.",
      );
      await onSaved?.();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save your recruiting profile.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-6">
      <fieldset>
        <legend className="section-kicker">First, choose your side</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            selected={mode === "candidate"}
            title="I’m looking for a job"
            detail="Describe the roles and terms that would make you engage."
            onClick={() => chooseMode("candidate")}
          />
          <ChoiceCard
            selected={mode === "employer"}
            title="I’m hiring someone"
            detail="Describe the role and the terms you can actually offer."
            onClick={() => chooseMode("employer")}
          />
        </div>
      </fieldset>

      {mode ? (
        <div className="mt-7 space-y-7">
          <section className="rounded-2xl border border-line bg-white/55 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker">The work</p>
                <h3 className="mt-1 text-lg font-semibold text-matcha-deep">
                  {mode === "candidate" ? "What fits you?" : "Who fits this role?"}
                </h3>
              </div>
              <span className="rounded-full bg-matcha-soft/12 px-3 py-1 text-xs font-semibold text-matcha-deep">
                Private match data
              </span>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Role family"
                value={roleFamily}
                onChange={setRoleFamily}
                options={HIRING_ROLE_FAMILIES}
                placeholder="Choose a function"
                required
              />
              <SelectField
                label="Seniority"
                value={level}
                onChange={setLevel}
                options={HIRING_LEVELS}
                placeholder="Choose a level"
                required
              />
              <SelectField
                label="Employment type"
                value={employmentType}
                onChange={setEmploymentType}
                options={HIRING_EMPLOYMENT_TYPES}
                placeholder="Choose a type"
                required
              />
              <SelectField
                label="Work mode"
                value={workMode}
                onChange={setWorkMode}
                options={HIRING_WORK_MODES}
                placeholder="Remote, hybrid, or onsite"
                required
              />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-white/55 p-4 sm:p-5">
            <p className="section-kicker">Place</p>
            <h3 className="mt-1 text-lg font-semibold text-matcha-deep">
              Choose a city, then define the vicinity.
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted">
              A city is an anchor, not a hard boundary. Remote work remains a separate choice.
            </p>
            {existingLocations.length && !clearExistingLocations ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-muted">Saved:</span>
                {existingLocations.map((location) => (
                  <span key={location} className="rounded-full border border-line bg-white px-3 py-1.5 text-ink">
                    {location}
                  </span>
                ))}
                <button
                  type="button"
                  className="font-semibold text-danger"
                  onClick={() => setClearExistingLocations(true)}
                >
                  Replace
                </button>
              </div>
            ) : null}
            <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-end">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">
                  {existingLocations.length && !clearExistingLocations
                    ? "Add another city"
                    : "City or cities"}
                </span>
                <LocationAutocomplete
                  granularity="city"
                  multiple
                  label="Work location cities"
                  selected={locations}
                  onChange={setLocations}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">Acceptable vicinity</span>
                <select
                  className="field"
                  value={radiusMiles}
                  onChange={(event) => setRadiusMiles(event.target.value)}
                >
                  {HIRING_RADIUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-white/55 p-4 sm:p-5">
            <p className="section-kicker">Terms</p>
            <h3 className="mt-1 text-lg font-semibold text-matcha-deep">
              Make the hard constraints unambiguous.
            </h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">
                  {mode === "candidate"
                    ? "Minimum annual base compensation"
                    : "Maximum annual base compensation"}
                </span>
                <span className="grid grid-cols-[7rem_1fr] overflow-hidden rounded-xl border border-line bg-white focus-within:border-matcha-soft focus-within:ring-3 focus-within:ring-matcha/10">
                  <select
                    aria-label="Compensation currency"
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
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
                    value={compensation}
                    onChange={(event) => setCompensation(event.target.value)}
                    placeholder="150,000"
                    className="min-h-11 min-w-0 px-3 outline-none"
                  />
                </span>
                <span className="text-xs text-muted">Annual base, before bonus or equity.</span>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">
                  {mode === "candidate" ? "Minimum equity (%)" : "Maximum equity (%)"}
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.001"
                  inputMode="decimal"
                  value={equity}
                  onChange={(event) => setEquity(event.target.value)}
                  placeholder="0.25"
                  className="field"
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">
                  {mode === "candidate" ? "Do you need sponsorship?" : "Is sponsorship available?"}
                </span>
                <select
                  value={sponsorship}
                  onChange={(event) => setSponsorship(event.target.value)}
                  className="field"
                >
                  <option value="">Not specified</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">
                  {mode === "candidate" ? "Earliest start date" : "Latest acceptable start"}
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="field"
                />
              </label>
            </div>
          </section>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">What may be shared after mutual approval?</span>
            <textarea
              rows={3}
              maxLength={1_000}
              value={introductionSummary}
              onChange={(event) => setIntroductionSummary(event.target.value)}
              placeholder={
                mode === "candidate"
                  ? "For example: product-minded platform engineer who enjoys early-stage teams."
                  : "For example: a small infrastructure team with direct product ownership."
              }
              className="field"
            />
            <span className="text-xs leading-5 text-muted">
              Your identity and this summary stay hidden until both people approve an introduction.
            </span>
          </label>

          {message ? (
            <p role="status" className="rounded-xl border border-matcha-soft/40 bg-matcha-soft/10 px-4 py-3 text-sm font-medium text-matcha-deep">
              {message}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="button-primary" disabled={busy}>
              {busy
                ? "Saving…"
                : enrollment.status === "active"
                  ? "Update private criteria"
                  : mode === "candidate"
                    ? "Start private job search"
                    : "Start private candidate search"}
            </button>
            <p className="text-xs leading-5 text-muted">
              Private terms are compared, not displayed. You approve every introduction.
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-muted">
          Your choice changes the questions below. Nothing is activated until you save.
        </p>
      )}
    </form>
  );
}
