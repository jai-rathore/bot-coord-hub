"use client";

import { useMemo, useState } from "react";
import {
  LocationAutocomplete,
  type CanonicalLocationSuggestion,
} from "@/components/location-autocomplete";

type Question = {
  key: string;
  prompt: string;
  description: string | null;
  type:
    | "text"
    | "string_list"
    | "location_list"
    | "number"
    | "boolean"
    | "date"
    | "enum";
  required: boolean;
  sensitivity: "discoverable" | "private" | "disclose_after_match";
  options: string[] | null;
  locationGranularity:
    | "country"
    | "region"
    | "city"
    | "neighborhood"
    | null;
  retentionDays: number;
};

type IntentItem = {
  slug: string;
  name: string;
  description: string | null;
  agentPrompt: string;
  enrollment: { summary: string; questions: Question[] };
  discovery: { locationGranularity: string; pageLimit: number };
  currentEnrollment: {
    id: string | null;
    status: string;
    publicClaims: Record<string, unknown>;
    disclosureClaims: Record<string, unknown>;
    missingFields: string[];
    consentedAt: string | null;
    expiresAt: string | null;
    reviewSnapshotHash: string | null;
    ownerReview: {
      claims: {
        public: Record<string, unknown>;
        private: Record<string, unknown>;
        disclosureAfterMatch: Record<string, unknown>;
      };
      provenance: Record<string, unknown>;
      location: Record<string, unknown> | null;
    } | null;
  };
};

type InterestItem = {
  id: string | null;
  intentSlug: string;
  direction: "incoming" | "outgoing";
  status: string;
  requesterConfirmed: boolean;
  awaitingYourApproval: boolean;
  compatibility: Record<string, unknown>;
  disclosure: Record<string, unknown> | null;
  sessionId: string | null;
  createdAt: string;
};

type AuditItem = {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

async function discoveryAction(body: Record<string, unknown>) {
  const response = await fetch("/api/discovery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as {
    error?: string;
    enrollment?: IntentItem["currentEnrollment"];
  };
  if (!response.ok) throw new Error(data.error ?? "Discovery request failed");
  return data;
}

function sensitivityLabel(value: Question["sensitivity"]) {
  if (value === "private") return "Private match only";
  if (value === "disclose_after_match") return "After mutual approval";
  return "Anonymous discovery card";
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
}) {
  const className =
    "mt-2 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-matcha";
  if (question.type === "enum" || question.type === "boolean") {
    const options =
      question.type === "boolean"
        ? [
            { value: "", label: "Choose…" },
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]
        : [
            { value: "", label: "Choose…" },
            ...(question.options ?? []).map((option) => ({
              value: option,
              label: option.replaceAll("_", " "),
            })),
          ];
    return (
      <select
        className={className}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      className={className}
      type={
        question.type === "number"
          ? "number"
          : question.type === "date"
            ? "date"
            : "text"
      }
      value={value}
      placeholder={
        question.type === "string_list"
          ? "Comma-separated values"
          : undefined
      }
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function DiscoveryManager({
  initialIntents,
  initialInterests,
  initialAudit,
}: {
  initialIntents: IntentItem[];
  initialInterests: InterestItem[];
  initialAudit: AuditItem[];
}) {
  const [intents, setIntents] = useState(initialIntents);
  const [interests, setInterests] = useState(initialInterests);
  const [audit] = useState(initialAudit);
  const [selectedSlug, setSelectedSlug] = useState(
    initialIntents[0]?.slug ?? "",
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [locationValues, setLocationValues] = useState<
    Record<string, CanonicalLocationSuggestion[]>
  >({});
  const [clearFields, setClearFields] = useState<Set<string>>(new Set());
  const [coarseLocation, setCoarseLocation] = useState<
    CanonicalLocationSuggestion[]
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = useMemo(
    () => intents.find((intent) => intent.slug === selectedSlug),
    [intents, selectedSlug],
  );

  function refresh() {
    window.location.reload();
  }

  async function submitEnrollment() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const claims: Record<string, unknown> = {};
      for (const question of selected.enrollment.questions) {
        if (clearFields.has(question.key)) {
          claims[question.key] = null;
          continue;
        }
        if (question.type === "location_list") {
          const resolved = locationValues[question.key] ?? [];
          if (resolved.length) {
            claims[question.key] = resolved.map(
              (location) => location.resolutionToken,
            );
          }
          continue;
        }
        const raw = values[question.key]?.trim();
        if (!raw) continue;
        claims[question.key] =
          question.type === "string_list"
            ? raw
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
            : question.type === "number"
              ? Number(raw)
              : question.type === "boolean"
                ? raw === "true"
                : raw;
      }
      const locationBody =
        selected.discovery.locationGranularity === "none" ||
        !coarseLocation[0]
          ? undefined
          : {
              resolutionToken: coarseLocation[0].resolutionToken,
              visibility: "private_match",
            };
      const result = await discoveryAction({
        action: "submit_enrollment",
        intentSlug: selected.slug,
        claims,
        provenance: {},
        location: locationBody,
        requestActivation: true,
      });
      setIntents((current) =>
        current.map((intent) =>
          intent.slug === selected.slug && result.enrollment
            ? { ...intent, currentEnrollment: result.enrollment }
            : intent,
        ),
      );
      setClearFields(new Set());
      setLocationValues({});
      setCoarseLocation([]);
      setMessage(
        "Enrollment activated. Your agent can now search this purpose without exposing your identity or private answers.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Request failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decideEnrollment(decision: "approve" | "pause" | "revoke") {
    if (!selected?.currentEnrollment.id) return;
    setBusy(true);
    setError(null);
    try {
      const result = await discoveryAction({
        action: "decide_enrollment",
        enrollmentId: selected.currentEnrollment.id,
        decision,
        snapshotHash: selected.currentEnrollment.reviewSnapshotHash,
      });
      setIntents((current) =>
        current.map((intent) =>
          intent.slug === selected.slug && result.enrollment
            ? { ...intent, currentEnrollment: result.enrollment }
            : intent,
        ),
      );
      setMessage(`Enrollment ${decision === "approve" ? "approved" : decision}d.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Request failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function interestAction(
    interestId: string,
    action:
      | "confirm_request"
      | "accept"
      | "decline"
      | "block"
      | "report",
  ) {
    setBusy(true);
    setError(null);
    try {
      await discoveryAction(
        action === "confirm_request" ||
        action === "accept" ||
        action === "decline"
          ? {
              action: "decide_interest",
              interestId,
              decision: action,
            }
          : action === "block"
            ? { action: "block", interestId, reasonCode: "user_choice" }
            : {
                action: "report",
                interestId,
                reasonCode: "safety_concern",
                block: true,
              },
      );
      setInterests((current) =>
        current.map((interest) =>
          interest.id === interestId &&
          (action === "confirm_request" ||
            action === "accept" ||
            action === "decline")
            ? {
                ...interest,
                status:
                  action === "accept"
                    ? "accepted"
                    : action === "decline"
                      ? "declined"
                      : interest.status,
                requesterConfirmed:
                  action === "confirm_request"
                    ? true
                    : interest.requesterConfirmed,
                awaitingYourApproval:
                  action === "confirm_request"
                    ? false
                    : interest.awaitingYourApproval,
              }
            : interest,
        ),
      );
      setMessage(
        action === "confirm_request"
          ? "Your introduction request is approved. The anonymous participant has been notified."
          : action === "accept"
          ? "Mutual interest confirmed. Only approved introduction fields were released."
          : action === "report"
            ? "Report submitted and participant blocked."
            : `Participant ${action}ed.`,
      );
      if (action === "accept") refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Request failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
      <div className="space-y-8">
        <section className="surface-card p-5 sm:p-7">
          <div className="flex flex-wrap gap-2">
            {intents.map((intent) => (
              <button
                key={intent.slug}
                type="button"
                onClick={() => {
                  setSelectedSlug(intent.slug);
                  setValues({});
                  setLocationValues({});
                  setCoarseLocation([]);
                  setClearFields(new Set());
                  setMessage(null);
                  setError(null);
                }}
                className={`rounded-full px-3 py-2 text-sm font-semibold ${
                  selectedSlug === intent.slug
                    ? "bg-matcha-deep text-white"
                    : "border border-line bg-white text-matcha-deep"
                }`}
              >
                {intent.name}
              </button>
            ))}
          </div>

          {selected ? (
            <div className="mt-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
                    {selected.name}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                    {selected.enrollment.summary}
                  </p>
                </div>
                <span className="rounded-full border border-line bg-mist px-3 py-1 text-xs font-semibold text-muted">
                  {selected.currentEnrollment.status.replaceAll("_", " ")}
                </span>
              </div>

              <div className="mt-6 space-y-5">
                {selected.enrollment.questions.map((question) => (
                  <label key={question.key} className="block">
                    <span className="text-sm font-semibold text-ink">
                      {question.prompt}
                      {question.required ? " *" : ""}
                    </span>
                    {question.description ? (
                      <span className="mt-1 block text-xs leading-5 text-muted">
                        {question.description}
                      </span>
                    ) : null}
                    <span className="mt-1 block text-xs text-muted">
                      {sensitivityLabel(question.sensitivity)} · retained up to{" "}
                      {question.retentionDays} days
                    </span>
                    {question.type === "location_list" ? (
                      <div className="mt-2">
                        <LocationAutocomplete
                          key={`${selected.slug}:${question.key}`}
                          granularity={question.locationGranularity ?? "city"}
                          multiple
                          label={question.prompt}
                          selected={locationValues[question.key] ?? []}
                          onChange={(locations) =>
                            setLocationValues((current) => ({
                              ...current,
                              [question.key]: locations,
                            }))
                          }
                        />
                      </div>
                    ) : (
                      <QuestionInput
                        question={question}
                        value={values[question.key] ?? ""}
                        onChange={(value) =>
                          setValues((current) => ({
                            ...current,
                            [question.key]: value,
                          }))
                        }
                      />
                    )}
                    {selected.currentEnrollment.ownerReview &&
                    Object.values(
                      selected.currentEnrollment.ownerReview.claims,
                    ).some(
                      (claims) => claims[question.key] !== undefined,
                    ) ? (
                      <button
                        type="button"
                        onClick={() =>
                          setClearFields((current) => {
                            const next = new Set(current);
                            if (next.has(question.key)) next.delete(question.key);
                            else next.add(question.key);
                            return next;
                          })
                        }
                        className={`mt-2 text-xs font-semibold ${
                          clearFields.has(question.key)
                            ? "text-danger"
                            : "text-muted"
                        }`}
                      >
                        {clearFields.has(question.key)
                          ? "This saved value will be removed"
                          : "Clear saved value"}
                      </button>
                    ) : null}
                  </label>
                ))}
              </div>

              {selected.discovery.locationGranularity !== "none" ? (
                <fieldset className="mt-7 rounded-2xl border border-line bg-mist/40 p-4">
                  <legend className="px-1 text-sm font-semibold text-matcha-deep">
                    Coarse location for private matching
                  </legend>
                  <p className="mb-4 text-xs leading-5 text-muted">
                    HoneyMatcha does not accept GPS coordinates. This location
                    remains private until your disclosure policy allows it.
                    Choose a canonical suggestion so spelling and aliases do
                    not create false mismatches. City and neighborhood search
                    text is sent to Geoapify without your HoneyMatcha identity.
                  </p>
                  {selected.currentEnrollment.ownerReview?.location &&
                  !coarseLocation.length ? (
                    <div className="mb-3 rounded-xl bg-white px-3 py-2 text-xs text-muted">
                      <p>
                        Saved:{" "}
                        {String(
                          selected.currentEnrollment.ownerReview.location
                            .label ?? "canonical coarse location",
                        )}
                      </p>
                      {selected.currentEnrollment.ownerReview.location
                        .provider === "geoapify" ? (
                        <p className="mt-1 text-[0.68rem]">
                          Powered by{" "}
                          <a
                            href="https://www.geoapify.com/"
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            Geoapify
                          </a>
                          ; ©{" "}
                          <a
                            href="https://www.openstreetmap.org/copyright"
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            OpenStreetMap contributors
                          </a>
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <LocationAutocomplete
                    key={`${selected.slug}:${selected.discovery.locationGranularity}`}
                    granularity={
                      selected.discovery.locationGranularity as
                        | "country"
                        | "region"
                        | "city"
                        | "neighborhood"
                    }
                    label="Coarse location for private matching"
                    selected={coarseLocation}
                    onChange={setCoarseLocation}
                  />
                </fieldset>
              ) : null}

              {selected.currentEnrollment.status === "pending_approval" &&
              selected.currentEnrollment.ownerReview ? (
                <section className="mt-6 rounded-2xl border border-honey/60 bg-honey/10 p-4">
                  <h3 className="text-sm font-semibold text-matcha-deep">
                    Review exactly what your agent submitted
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Approval is bound to this snapshot. If any value, source, or
                    location changes, HoneyMatcha requires a fresh review.
                  </p>
                  <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-white p-3 text-xs leading-5 text-muted">
                    {JSON.stringify(
                      selected.currentEnrollment.ownerReview,
                      null,
                      2,
                    )}
                  </pre>
                  {JSON.stringify(
                    selected.currentEnrollment.ownerReview,
                  ).includes('"provider":"geoapify"') ? (
                    <p className="mt-2 text-[0.68rem] text-muted">
                      Location data powered by{" "}
                      <a
                        href="https://www.geoapify.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        Geoapify
                      </a>
                      ; ©{" "}
                      <a
                        href="https://www.openstreetmap.org/copyright"
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        OpenStreetMap contributors
                      </a>
                    </p>
                  ) : null}
                </section>
              ) : null}

              {message ? (
                <p className="mt-5 rounded-xl border border-matcha-soft/40 bg-matcha-soft/10 px-4 py-3 text-sm text-matcha">
                  {message}
                </p>
              ) : null}
              {error ? (
                <p className="mt-5 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
                  {error}
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={submitEnrollment}
                  className="rounded-xl bg-matcha-deep px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Save and activate
                </button>
                {selected.currentEnrollment.status === "pending_approval" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => decideEnrollment("approve")}
                    className="rounded-xl border border-matcha px-4 py-2.5 text-sm font-semibold text-matcha"
                  >
                    Approve agent submission
                  </button>
                ) : null}
                {selected.currentEnrollment.status === "active" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => decideEnrollment("pause")}
                    className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-muted"
                  >
                    Pause discovery
                  </button>
                ) : null}
                {selected.currentEnrollment.id ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => decideEnrollment("revoke")}
                    className="rounded-xl border border-danger/30 px-4 py-2.5 text-sm font-semibold text-danger"
                  >
                    Revoke
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted">
              No discovery intents are currently live.
            </p>
          )}
        </section>

        <section className="surface-card p-5 sm:p-7">
          <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
            Introductions
          </h2>
          <div className="mt-5 space-y-4">
            {interests.length ? (
              interests.map((interest) => (
                <article
                  key={interest.id ?? `${interest.intentSlug}-${interest.createdAt}`}
                  className="rounded-2xl border border-line bg-white/70 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {interest.intentSlug.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {interest.direction} · {interest.status}
                      </p>
                    </div>
                    {interest.direction === "incoming" &&
                    interest.status === "pending" &&
                    interest.id ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => interestAction(interest.id!, "accept")}
                          className="rounded-lg bg-matcha-deep px-3 py-2 text-xs font-semibold text-white"
                        >
                          Approve introduction
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => interestAction(interest.id!, "decline")}
                          className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted"
                        >
                          Decline
                        </button>
                      </div>
                    ) : null}
                    {interest.direction === "outgoing" &&
                    interest.status === "pending" &&
                    !interest.requesterConfirmed &&
                    interest.id ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          interestAction(interest.id!, "confirm_request")
                        }
                        className="rounded-lg bg-matcha-deep px-3 py-2 text-xs font-semibold text-white"
                      >
                        Approve request
                      </button>
                    ) : null}
                  </div>
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-mist p-3 text-xs leading-5 text-muted">
                    {JSON.stringify(
                      interest.status === "accepted"
                        ? interest.disclosure
                        : interest.compatibility,
                      null,
                      2,
                    )}
                  </pre>
                  {interest.id ? (
                    <div className="mt-3 flex gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => interestAction(interest.id!, "block")}
                        className="font-semibold text-muted"
                      >
                        Block
                      </button>
                      <button
                        type="button"
                        onClick={() => interestAction(interest.id!, "report")}
                        className="font-semibold text-danger"
                      >
                        Report and block
                      </button>
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="text-sm text-muted">
                Your agent has not requested or received an introduction yet.
              </p>
            )}
          </div>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="surface-card p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-matcha">
            Trust model
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
            <li>Discoverable does not mean identifiable.</li>
            <li>Compatibility does not reveal private answers.</li>
            <li>Both people approve before introduction fields are released.</li>
            <li>Blocking overrides matching and revokes disclosure.</li>
          </ul>
        </section>
        <section className="surface-card p-5">
          <h2 className="font-semibold text-matcha-deep">Recent privacy events</h2>
          <div className="mt-4 space-y-3">
            {audit.length ? (
              audit.slice(0, 12).map((item) => (
                <div key={item.id} className="border-b border-line pb-3 text-xs">
                  <p className="font-semibold text-ink">
                    {item.action.replaceAll("_", " ").replaceAll(".", " · ")}
                  </p>
                  <p className="mt-1 text-muted">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">No discovery activity yet.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
