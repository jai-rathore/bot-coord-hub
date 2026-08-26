"use client";

import { useEffect, useMemo, useState } from "react";
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

type GuestTask = {
  publicId: string;
  taskType:
    | "binary_choice"
    | "text_response"
    | "availability"
    | "hiring_compatibility";
  title: string;
  description: string | null;
  config: Record<string, unknown>;
  status: string;
  expiresAt: string;
  remainingResponses: number;
  latestAlignment?: HiringAlignment;
};

type HiringAlignment = {
  alignment?: string;
  verdict?: string;
  note?: string;
  nextStep?: string;
  gaps?: Array<{
    dimension?: string;
    message?: string;
    recruiterCanAdjust?: boolean;
  }>;
};

type SlotDraft = {
  start: string;
  end: string;
  timezone: string;
};

function tokenStorageKey(publicId: string) {
  return `honeymatcha:guest:${publicId}`;
}

function formatLocationValue(value: unknown) {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).label === "string"
  ) {
    return String((value as Record<string, unknown>).label);
  }
  return "";
}

function offerValue(
  key: string,
  value: unknown,
  offer: Record<string, unknown>,
) {
  if (key === "compensationMaximum") {
    return formatHiringMoney(value, offer.compensationCurrency);
  }
  if (key === "locationRadiusMiles") {
    return Number(value) === 0
      ? "Selected cities only"
      : `Within ${Number(value)} miles`;
  }
  if (Array.isArray(value)) {
    return value.map(formatLocationValue).filter(Boolean).join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function GuestTaskClient({ publicId }: { publicId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [task, setTask] = useState<GuestTask | null>(null);
  const [email, setEmail] = useState("");
  const [choice, setChoice] = useState("");
  const [text, setText] = useState("");
  const [compensationMinimum, setCompensationMinimum] = useState("");
  const [compensationCurrency, setCompensationCurrency] = useState("USD");
  const [equityMinimumPercent, setEquityMinimumPercent] = useState("");
  const [companyInterest, setCompanyInterest] = useState("open");
  const [roleInterest, setRoleInterest] = useState("open");
  const [locations, setLocations] = useState<CanonicalLocationSuggestion[]>([]);
  const [locationRadiusMiles, setLocationRadiusMiles] = useState("25");
  const [workMode, setWorkMode] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [sponsorshipRequired, setSponsorshipRequired] = useState("no");
  const [earliestStart, setEarliestStart] = useState("");
  const [level, setLevel] = useState("");
  const [roleFocus, setRoleFocus] = useState("");
  const [sharingMode, setSharingMode] = useState("gaps_only");
  const [recruiterMayRevise, setRecruiterMayRevise] = useState(true);
  const [conversationSignal, setConversationSignal] = useState("open_to_revision");
  const [approvedNote, setApprovedNote] = useState("");
  const [alignment, setAlignment] = useState<HiringAlignment | null>(null);
  const [slots, setSlots] = useState<SlotDraft[]>([
    { start: "", end: "", timezone: "UTC" },
  ]);
  const [status, setStatus] = useState<
    "loading" | "ready" | "submitting" | "done" | "error"
  >("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fragment = window.location.hash.replace(/^#/, "");
    const stored = window.sessionStorage.getItem(tokenStorageKey(publicId));
    const resolved = fragment.startsWith("gt_") ? fragment : stored;
    if (!resolved) {
      queueMicrotask(() => {
        setError("This private response link is missing its capability.");
        setStatus("error");
      });
      return;
    }
    if (fragment) {
      window.sessionStorage.setItem(tokenStorageKey(publicId), resolved);
      window.history.replaceState(null, "", window.location.pathname);
    }
    let cancelled = false;
    void fetch(`/api/guest/tasks/${encodeURIComponent(publicId)}`, {
      headers: { Authorization: `Guest ${resolved}` },
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not open request");
        if (!cancelled) {
          setToken(resolved);
          setTask(data.task);
          const offer = data.task.config?.offer as
            | Record<string, unknown>
            | undefined;
          if (
            offer &&
            typeof offer === "object" &&
            typeof offer.compensationCurrency === "string"
          ) {
            setCompensationCurrency(offer.compensationCurrency);
          }
          if (data.task.latestAlignment) {
            setAlignment(data.task.latestAlignment);
            setStatus("done");
          } else {
            setStatus("ready");
          }
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error ? reason.message : "Could not open request",
          );
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [publicId]);

  const choices = useMemo(
    () =>
      Array.isArray(task?.config.choices)
        ? task.config.choices.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    [task],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !task) return;
    setStatus("submitting");
    setError(null);
    const response =
      task.taskType === "binary_choice"
        ? { choice }
        : task.taskType === "text_response"
          ? { text }
          : task.taskType === "hiring_compatibility"
            ? {
                compensationMinimum: compensationMinimum
                  ? Number(compensationMinimum)
                  : undefined,
                compensationCurrency: compensationMinimum
                  ? compensationCurrency
                  : undefined,
                equityMinimumPercent: equityMinimumPercent
                  ? Number(equityMinimumPercent)
                  : undefined,
                companyInterest,
                roleInterest,
                locations: locations.map(
                  (location) => location.resolutionToken,
                ),
                locationRadiusMiles: locations.length
                  ? Number(locationRadiusMiles)
                  : undefined,
                workModes: workMode ? [workMode] : [],
                employmentTypes: employmentType ? [employmentType] : [],
                sponsorshipRequired: sponsorshipRequired === "yes",
                earliestStart: earliestStart || undefined,
                levels: level ? [level] : [],
                roleFocus: roleFocus ? [roleFocus] : [],
                sharingMode,
                recruiterMayRevise,
                conversationSignal,
                approvedNote: approvedNote || undefined,
              }
          : {
              slots: slots.map((slot) => ({
                start: new Date(slot.start).toISOString(),
                end: new Date(slot.end).toISOString(),
                timezone: slot.timezone || "UTC",
              })),
            };
    try {
      const result = await fetch(
        `/api/guest/tasks/${encodeURIComponent(publicId)}/respond`,
        {
          method: "POST",
          headers: {
            Authorization: `Guest ${token}`,
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ email, response }),
        },
      );
      const data = await result.json();
      if (!result.ok) throw new Error(data.error ?? "Could not send response");
      if (task.taskType !== "hiring_compatibility") {
        window.sessionStorage.removeItem(tokenStorageKey(publicId));
      }
      if (data.alignment) setAlignment(data.alignment);
      setStatus("done");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not send response",
      );
      setStatus("ready");
    }
  }

  if (status === "loading") {
    return <p className="text-sm text-muted">Opening private request…</p>;
  }
  if (status === "error" || !task) {
    return (
      <div role="alert">
        <p className="font-semibold text-danger">This link cannot be opened.</p>
        <p className="mt-2 text-sm text-muted">{error}</p>
      </div>
    );
  }
  if (status === "done") {
    if (task.taskType === "hiring_compatibility") {
      const gaps = Array.isArray(alignment?.gaps) ? alignment.gaps : [];
      const ready = alignment?.alignment === "ready_for_intro";
      return (
        <div role="status">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-matcha">
            Private alignment sent
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-matcha-deep">
            {ready ? "The terms align." : "You can skip the cold reply."}
          </h1>
          <p className="mt-3 leading-7 text-muted">
            {alignment?.note ??
              "HoneyMatcha sent only the expectations you approved. The recruiter can revise adjustable terms without seeing anything else."}
          </p>
          {gaps.length ? (
            <div className="mt-5 rounded-xl border border-line bg-white/65 p-4">
              <p className="text-xs font-bold tracking-[0.1em] text-matcha uppercase">
                What is not aligned yet
              </p>
              <ul className="mt-3 space-y-2">
                {gaps.map((gap, index) => (
                  <li key={`${gap.dimension}-${index}`} className="flex gap-2 text-sm text-ink">
                    <span className="mt-1 text-honey" aria-hidden="true">●</span>
                    <span>{gap.message ?? gap.dimension}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-4 text-sm font-medium leading-6 text-matcha-deep">
            {alignment?.nextStep ??
              "Keep this private link. If the recruiter updates the terms, the new alignment will appear here and in your agent's inbox."}
          </p>
          <p className="mt-3 text-xs leading-5 text-muted">
            This tab keeps the scoped capability in session storage so you can
            see recruiter-approved revisions. It cannot access anything else.
          </p>
        </div>
      );
    }
    return (
      <div role="status">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-matcha">
          Response sent
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-matcha-deep">
          You&apos;re done.
        </h1>
        <p className="mt-3 text-muted">
          HoneyMatcha shared your answer with the person who invited you. You
          did not join a network or create an account.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-matcha">
        Private request
      </p>
      <h1 className="display-title mt-2 text-3xl">
        {task.title}
      </h1>
      {task.description ? (
        <p className="mt-3 text-muted">{task.description}</p>
      ) : null}
      {task.taskType === "hiring_compatibility" &&
      typeof task.config.privacy === "string" ? (
        <p className="mt-3 rounded-lg border border-matcha-soft bg-[rgba(111,154,124,0.08)] p-3 text-sm text-matcha-deep">
          {task.config.privacy}
        </p>
      ) : null}
      {task.taskType === "hiring_compatibility" &&
      task.config.offer &&
      typeof task.config.offer === "object" ? (
        <div className="mt-4 rounded-xl border border-line bg-white/68 p-4">
          <p className="text-xs font-bold tracking-[0.1em] text-matcha uppercase">
            What the recruiter shared
          </p>
          <dl className="mt-3 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
            {Object.entries(task.config.offer as Record<string, unknown>)
              .filter(([key]) => key !== "compensationCurrency")
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs text-muted">
                    {key
                      .replace(/([A-Z])/g, " $1")
                      .replace(/^./, (letter) => letter.toUpperCase())}
                  </dt>
                  <dd className="font-medium text-ink">
                    {offerValue(
                      key,
                      value,
                      task.config.offer as Record<string, unknown>,
                    )}
                  </dd>
                </div>
              ))}
          </dl>
          {typeof task.config.candidateFacingUpdate === "string" ? (
            <p className="mt-3 border-t border-line pt-3 text-sm leading-6 text-matcha-deep">
              Latest update: {task.config.candidateFacingUpdate}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="mt-3 text-xs text-muted">
        Expires {new Date(task.expiresAt).toLocaleString()}
      </p>

      <form onSubmit={submit} className="mt-7 space-y-5">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Your email</span>
          <span className="text-xs text-muted">
            Use the address this request was sent to.
          </span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="rounded-md border border-line bg-white px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-matcha"
          />
        </label>

        {task.taskType === "binary_choice" ? (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium text-ink">
              Your answer
            </legend>
            {choices.map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-3 py-3 text-sm text-ink has-[:checked]:border-matcha has-[:checked]:bg-[rgba(111,154,124,0.08)]"
              >
                <input
                  type="radio"
                  name="choice"
                  value={value}
                  checked={choice === value}
                  onChange={() => setChoice(value)}
                  required
                />
                {value}
              </label>
            ))}
          </fieldset>
        ) : null}

        {task.taskType === "text_response" ? (
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">Your response</span>
            <textarea
              name="response"
              value={text}
              onChange={(event) => setText(event.target.value)}
              required
              maxLength={Number(task.config.maxLength ?? 1_000)}
              rows={5}
              className="rounded-md border border-line bg-white px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-matcha"
            />
          </label>
        ) : null}

        {task.taskType === "availability" ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-ink">
              Times that work for you
            </legend>
            {slots.map((slot, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-lg border border-line bg-white/70 p-3 sm:grid-cols-2"
              >
                <label className="grid gap-1 text-xs text-muted">
                  Start
                  <input
                    type="datetime-local"
                    value={slot.start}
                    onChange={(event) =>
                      setSlots((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, start: event.target.value }
                            : item,
                        ),
                      )
                    }
                    required
                    className="rounded border border-line px-2 py-2 text-sm text-ink"
                  />
                </label>
                <label className="grid gap-1 text-xs text-muted">
                  End
                  <input
                    type="datetime-local"
                    value={slot.end}
                    onChange={(event) =>
                      setSlots((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, end: event.target.value }
                            : item,
                        ),
                      )
                    }
                    required
                    className="rounded border border-line px-2 py-2 text-sm text-ink"
                  />
                </label>
              </div>
            ))}
            {slots.length < Number(task.config.maxSlots ?? 12) ? (
              <button
                type="button"
                onClick={() =>
                  setSlots((current) => [
                    ...current,
                    { start: "", end: "", timezone: "UTC" },
                  ])
                }
                className="text-sm font-medium text-matcha-deep"
              >
                + Add another time
              </button>
            ) : null}
          </fieldset>
        ) : null}

        {task.taskType === "hiring_compatibility" ? (
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-ink">
              What would make this worth a conversation?
            </legend>
            <p className="text-xs leading-5 text-muted">
              Answer only what matters. You decide below whether the recruiter
              sees exact expectations or only which dimensions need work.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">Interest in the company</span>
                <select
                  value={companyInterest}
                  onChange={(event) => setCompanyInterest(event.target.value)}
                  className="field"
                >
                  <option value="interested">Interested</option>
                  <option value="open">Open if the terms fit</option>
                  <option value="not_interested">Not interested</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">Interest in the role</span>
                <select
                  value={roleInterest}
                  onChange={(event) => setRoleInterest(event.target.value)}
                  className="field"
                >
                  <option value="interested">Interested</option>
                  <option value="open">Open if the role changes</option>
                  <option value="not_interested">Not interested</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">Minimum annual base compensation</span>
              <span className="grid grid-cols-[7rem_1fr] overflow-hidden rounded-xl border border-line bg-white focus-within:border-matcha-soft focus-within:ring-3 focus-within:ring-matcha/10">
                <select
                  aria-label="Compensation currency"
                  value={compensationCurrency}
                  onChange={(event) => setCompensationCurrency(event.target.value)}
                  className="border-r border-line bg-mist/55 px-2 text-sm font-semibold outline-none"
                >
                  {HIRING_CURRENCIES.map((option) => (
                    <option key={option.value} value={option.value}>{option.value}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  max="10000000"
                  step="1000"
                  inputMode="numeric"
                  value={compensationMinimum}
                  onChange={(event) => setCompensationMinimum(event.target.value)}
                  placeholder="150,000"
                  className="min-h-11 min-w-0 px-3 outline-none"
                />
              </span>
              <span className="text-xs text-muted">Annual base, before bonus or equity.</span>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">
                Minimum equity percentage
              </span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.001"
                value={equityMinimumPercent}
                onChange={(event) => setEquityMinimumPercent(event.target.value)}
                placeholder="For example: 0.25"
                className="field"
              />
            </label>
            <div className="grid gap-4 rounded-2xl border border-line bg-white/55 p-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">Cities that work</span>
                <LocationAutocomplete
                  granularity="city"
                  multiple
                  label="Cities that work"
                  selected={locations}
                  onChange={setLocations}
                  resolveEndpoint={`/api/guest/tasks/${encodeURIComponent(publicId)}/locations`}
                  authorization={token ? `Guest ${token}` : undefined}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">Acceptable vicinity</span>
                <select value={locationRadiusMiles} onChange={(event) => setLocationRadiusMiles(event.target.value)} className="field">
                  {HIRING_RADIUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <p className="text-xs leading-5 text-muted sm:col-span-2">
                Choose a city anchor and how far around it works. Remote is selected separately.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">Work mode</span>
                <select value={workMode} onChange={(event) => setWorkMode(event.target.value)} className="field">
                  <option value="">Choose a mode</option>
                  {HIRING_WORK_MODES.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">Employment type</span>
                <select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} className="field">
                  <option value="">Choose a type</option>
                  {HIRING_EMPLOYMENT_TYPES.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">
                Do you require sponsorship?
              </span>
              <select
                value={sponsorshipRequired}
                onChange={(event) => setSponsorshipRequired(event.target.value)}
                className="rounded-md border border-line bg-white px-3 py-2.5"
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">Earliest start date</span>
              <input
                type="date"
                value={earliestStart}
                onChange={(event) => setEarliestStart(event.target.value)}
                className="rounded-md border border-line bg-white px-3 py-2.5"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">Seniority</span>
                <select value={level} onChange={(event) => setLevel(event.target.value)} className="field">
                  <option value="">Choose a level</option>
                  {HIRING_LEVELS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">Role family</span>
                <select value={roleFocus} onChange={(event) => setRoleFocus(event.target.value)} className="field">
                  <option value="">Choose a function</option>
                  {HIRING_ROLE_FAMILIES.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-xl border border-matcha-soft/35 bg-matcha-soft/8 p-4">
              <p className="text-sm font-semibold text-matcha-deep">
                What may HoneyMatcha tell the recruiter?
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="radio"
                  name="sharing-mode"
                  value="gaps_only"
                  checked={sharingMode === "gaps_only"}
                  onChange={() => setSharingMode("gaps_only")}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium text-ink">Alignment gaps only</span>
                  <span className="text-xs leading-5 text-muted">
                    Say which areas do not align, without sharing your numbers or lists.
                  </span>
                </span>
              </label>
              <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="radio"
                  name="sharing-mode"
                  value="exact_expectations"
                  checked={sharingMode === "exact_expectations"}
                  onChange={() => setSharingMode("exact_expectations")}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium text-ink">My exact expectations</span>
                  <span className="text-xs leading-5 text-muted">
                    Share the values above so the recruiter can decide what they can change.
                  </span>
                </span>
              </label>
            </div>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">Your signal</span>
              <select
                value={conversationSignal}
                onChange={(event) => setConversationSignal(event.target.value)}
                className="field"
              >
                <option value="ready_if_aligned">I am ready to talk if these align</option>
                <option value="open_to_revision">I am open to a revised role</option>
                <option value="not_interested">I do not want to pursue this</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">Approved note for the recruiter</span>
              <textarea
                rows={3}
                maxLength={1_000}
                value={approvedNote}
                onChange={(event) => setApprovedNote(event.target.value)}
                placeholder="Optional context your agent may pass along"
                className="field"
              />
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white/60 p-3 text-sm">
              <input
                type="checkbox"
                checked={recruiterMayRevise}
                onChange={(event) => setRecruiterMayRevise(event.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block font-medium text-ink">
                  The recruiter may revise the role and try again
                </span>
                <span className="text-xs leading-5 text-muted">
                  A revision never accepts a call for you. You keep the final yes.
                </span>
              </span>
            </label>
            <p className="text-xs leading-5 text-muted">
              HoneyMatcha compares expectations; it does not rank or automatically
              reject candidates.
            </p>
          </fieldset>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="button-primary w-full cursor-pointer disabled:opacity-60"
        >
          {status === "submitting" ? "Sending…" : "Send response"}
        </button>
      </form>
    </>
  );
}
