"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  LocationAutocomplete,
  type CanonicalLocationSuggestion,
} from "@/components/location-autocomplete";
import { CopyBlock } from "@/components/copy-block";
import { HiringProfileForm } from "@/components/hiring-profile-form";
import { SageDiscoveryConversation } from "@/components/sage-discovery-conversation";

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
  sourcePolicy?: "human_only" | "human_or_agent_with_approval";
  options: string[] | null;
  locationGranularity: "country" | "region" | "city" | "neighborhood" | null;
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

type SageCandidate = {
  recommendationId: string;
  intentSlug: string;
  candidateHandle?: string;
  compatibility: Record<string, unknown>;
  untrustedParticipantData: Record<string, unknown>;
  expiresAt: string;
};

type DiscoveryRecommendation = {
  id: string;
  intentSlug: string;
  compatibility: Record<string, unknown>;
  untrustedParticipantData: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
};

type DiscoveryCadence = {
  intentSlug: string;
  enabled: boolean;
  intervalHours: number;
  maxRecommendations: number;
  notifyOnNew: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastOutcome: string | null;
};

type SageDiscoveryJob = {
  id: string;
  state: string;
  result?: Record<string, unknown> | null;
  lastError?: string | null;
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

function candidatesFromJob(
  job: SageDiscoveryJob,
  intentSlug: string,
): SageCandidate[] {
  const candidates = job.result?.candidates;
  if (!Array.isArray(candidates)) return [];
  return candidates
    .filter(
      (candidate): candidate is SageCandidate =>
        Boolean(candidate) &&
        typeof candidate === "object" &&
        typeof (candidate as SageCandidate).recommendationId === "string",
    )
    .map((candidate) => ({ ...candidate, intentSlug }));
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
      min={question.key === "age" ? 18 : undefined}
      max={question.key === "age" ? 120 : undefined}
      inputMode={question.type === "number" ? "numeric" : undefined}
      placeholder={
        question.type === "string_list"
          ? "Comma-separated values"
          : question.key === "age"
            ? "18 or older"
            : undefined
      }
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function DiscoveryManager({
  initialIntents,
  initialInterests,
  initialRecommendations,
  initialCadences,
  initialAudit,
  hideIntentSwitcher = false,
}: {
  initialIntents: IntentItem[];
  initialInterests: InterestItem[];
  initialRecommendations: DiscoveryRecommendation[];
  initialCadences: DiscoveryCadence[];
  initialAudit: AuditItem[];
  hideIntentSwitcher?: boolean;
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
  const [sageJob, setSageJob] = useState<SageDiscoveryJob | null>(null);
  const [sageCandidates, setSageCandidates] = useState<SageCandidate[]>(
    initialRecommendations.map((recommendation) => ({
      recommendationId: recommendation.id,
      intentSlug: recommendation.intentSlug,
      compatibility: recommendation.compatibility,
      untrustedParticipantData: recommendation.untrustedParticipantData,
      expiresAt: recommendation.expiresAt,
    })),
  );
  const [cadences, setCadences] = useState(initialCadences);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const selected = useMemo(
    () => intents.find((intent) => intent.slug === selectedSlug),
    [intents, selectedSlug],
  );
  const selectedCadence = cadences.find(
    (cadence) => cadence.intentSlug === selectedSlug,
  ) ?? {
    intentSlug: selectedSlug,
    enabled: false,
    intervalHours: 168,
    maxRecommendations: 3,
    notifyOnNew: true,
    nextRunAt: null,
    lastRunAt: null,
    lastOutcome: null,
  };
  const visibleCandidates = sageCandidates.filter(
    (candidate) => candidate.intentSlug === selectedSlug,
  );
  const hiringSide = useMemo(() => {
    if (selected?.slug !== "hiring_compatibility") return null;
    const review = selected.currentEnrollment.ownerReview;
    const participantType = review
      ? {
          ...review.claims.public,
          ...review.claims.private,
          ...review.claims.disclosureAfterMatch,
        }.participantType
      : null;
    return participantType === "candidate" || participantType === "employer"
      ? participantType
      : null;
  }, [selected]);
  const hiringTarget = hiringSide === "candidate" ? "roles" : "candidates";

  useEffect(() => {
    if (!selectedSlug) return;
    let cancelled = false;
    void fetch("/api/sage/jobs", { cache: "no-store" })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { jobs?: SageDiscoveryJob[] })
          : {},
      )
      .then((data) => {
        if (cancelled) return;
        const latest = data.jobs?.find(
          (job) =>
            job.state === "completed" &&
            job.result?.intentSlug === selectedSlug &&
            Array.isArray(job.result?.candidates),
        );
        if (!latest) return;
        setSageJob(latest);
        const latestCandidates = candidatesFromJob(latest, selectedSlug).filter(
          (candidate) => new Date(candidate.expiresAt).getTime() > Date.now(),
        );
        setSageCandidates((current) => {
          const byId = new Map(
            current.map((candidate) => [candidate.recommendationId, candidate]),
          );
          for (const candidate of latestCandidates) {
            byId.set(candidate.recommendationId, candidate);
          }
          return [...byId.values()];
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  function refresh() {
    // Was window.location.reload(). That re-downloaded the document and all of
    // the JS, re-initialised Clerk, re-ran the app shell's queries, and wiped
    // the success message set just above before anyone could read it.
    startTransition(() => router.refresh());
  }

  async function reloadDiscoveryState() {
    const response = await fetch("/api/discovery", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as {
      intents?: IntentItem[];
      interests?: InterestItem[];
      recommendations?: DiscoveryRecommendation[];
      cadences?: DiscoveryCadence[];
    };
    if (data.intents) setIntents(data.intents);
    if (data.interests) setInterests(data.interests);
    if (data.recommendations) {
      setSageCandidates(
        data.recommendations.map((recommendation) => ({
          recommendationId: recommendation.id,
          intentSlug: recommendation.intentSlug,
          compatibility: recommendation.compatibility,
          untrustedParticipantData: recommendation.untrustedParticipantData,
          expiresAt: recommendation.expiresAt,
        })),
      );
    }
    if (data.cadences) setCadences(data.cadences);
  }

  async function pollSageDiscovery(jobId: string) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const response = await fetch("/api/sage/jobs", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { jobs?: SageDiscoveryJob[] };
      const next = data.jobs?.find((job) => job.id === jobId);
      if (!next) return;
      setSageJob(next);
      if (next.state === "completed") {
        const candidates = candidatesFromJob(next, selectedSlug);
        setSageCandidates((current) => {
          const byId = new Map(
            current.map((candidate) => [candidate.recommendationId, candidate]),
          );
          for (const candidate of candidates) {
            byId.set(candidate.recommendationId, candidate);
          }
          return [...byId.values()];
        });
        await reloadDiscoveryState();
        setMessage(
          candidates.length
            ? `Sage found ${candidates.length} anonymous ${candidates.length === 1 ? "possibility" : "possibilities"}. You decide whether to request an introduction.`
            : "Sage did not find a new compatible possibility in this scan.",
        );
        return;
      }
      if (["failed", "dead_letter"].includes(next.state)) {
        setError(next.lastError ?? "Sage could not finish this search.");
        return;
      }
    }
  }

  async function askSageToSearch() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/sage/jobs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          capability: "discovery_search",
          payload: {
            intentSlug: selected.slug,
            limit: selected.discovery.pageLimit,
          },
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        job?: SageDiscoveryJob;
      };
      if (!response.ok || !data.job) {
        throw new Error(data.error ?? "Sage could not start this search");
      }
      setSageJob(data.job);
      setMessage("Sage is checking anonymous, privacy-safe possibilities.");
      void pollSageDiscovery(data.job.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Search failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestSageIntroduction(candidate: SageCandidate) {
    setBusy(true);
    setError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch("/api/sage/jobs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          capability: "discovery_stage_introduction",
          payload: candidate.recommendationId
            ? { recommendationId: candidate.recommendationId }
            : { candidateHandle: candidate.candidateHandle },
          idempotencyKey,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        job?: SageDiscoveryJob;
      };
      if (!response.ok || !data.job) {
        throw new Error(
          data.error ?? "Sage could not prepare this introduction",
        );
      }
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        const jobsResponse = await fetch("/api/sage/jobs", {
          cache: "no-store",
        });
        if (!jobsResponse.ok) continue;
        const jobsData = (await jobsResponse.json()) as {
          jobs?: SageDiscoveryJob[];
        };
        const next = jobsData.jobs?.find((job) => job.id === data.job?.id);
        if (!next || ["pending", "running"].includes(next.state)) continue;
        if (["failed", "dead_letter"].includes(next.state)) {
          throw new Error(
            next.lastError ?? "Sage could not prepare this introduction",
          );
        }
        break;
      }
      setSageCandidates((current) =>
        current.filter(
          (item) => item.recommendationId !== candidate.recommendationId,
        ),
      );
      await reloadDiscoveryState();
      setMessage(
        "Sage prepared the anonymous introduction. Approve it below before the other person is notified.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Request failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveCadence(
    changes: Partial<
      Pick<
        DiscoveryCadence,
        "enabled" | "intervalHours" | "maxRecommendations" | "notifyOnNew"
      >
    >,
  ) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "set_cadence",
          intentSlug: selected.slug,
          enabled: changes.enabled ?? selectedCadence.enabled,
          intervalHours: changes.intervalHours ?? selectedCadence.intervalHours,
          maxRecommendations:
            changes.maxRecommendations ?? selectedCadence.maxRecommendations,
          notifyOnNew: changes.notifyOnNew ?? selectedCadence.notifyOnNew,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        cadence?: DiscoveryCadence;
      };
      if (!response.ok || !data.cadence) {
        throw new Error(data.error ?? "Could not save automatic discovery");
      }
      setCadences((current) => [
        ...current.filter(
          (item) => item.intentSlug !== data.cadence!.intentSlug,
        ),
        data.cadence!,
      ]);
      setMessage(
        data.cadence.enabled
          ? "Saved. Sage will search on this schedule and keep new anonymous possibilities here."
          : "Automatic search is off for this purpose.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save automatic discovery",
      );
    } finally {
      setBusy(false);
    }
  }

  async function dismissRecommendation(recommendationId: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "dismiss_recommendation",
          recommendationId,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not dismiss this possibility");
      }
      setSageCandidates((current) =>
        current.filter((item) => item.recommendationId !== recommendationId),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not dismiss this possibility",
      );
    } finally {
      setBusy(false);
    }
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
        if (question.type === "string_list") {
          const items = raw
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
          if (question.required && items.length === 0) {
            throw new Error(`${question.prompt} needs at least one value.`);
          }
          claims[question.key] = items;
          continue;
        }
        if (question.type === "number") {
          const parsed = Number(raw);
          if (
            question.key === "age" &&
            (!Number.isInteger(parsed) || parsed < 18)
          ) {
            throw new Error("Dating requires a confirmed age of 18 or older.");
          }
          claims[question.key] = parsed;
          continue;
        }
        claims[question.key] =
          question.type === "boolean" ? raw === "true" : raw;
      }
      const locationBody =
        selected.discovery.locationGranularity === "none" || !coarseLocation[0]
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
      setMessage(
        `Enrollment ${decision === "approve" ? "approved" : decision}d.`,
      );
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
    action: "confirm_request" | "accept" | "decline" | "block" | "report",
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
          {!hideIntentSwitcher ? (
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
                    setSageJob(null);
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
          ) : null}

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
                  {selected.slug === "dating_introduction" ? (
                    <p className="mt-3 max-w-2xl rounded-xl border border-honey/50 bg-honey/10 px-3 py-2 text-xs leading-5 text-matcha-deep">
                      Dating is 18+ only. Age and relationship intent must come
                      from you. Your agent can search and suggest; both people
                      confirm before anyone is identified.
                    </p>
                  ) : null}
                </div>
                <span className="rounded-full border border-line bg-mist px-3 py-1 text-xs font-semibold text-muted">
                  {selected.currentEnrollment.status.replaceAll("_", " ")}
                </span>
              </div>

              {selected.slug === "hiring_compatibility" ? (
                <HiringProfileForm
                  intentSlug={selected.slug}
                  enrollment={selected.currentEnrollment}
                  onSaved={reloadDiscoveryState}
                />
              ) : (
                <div className="mt-6 space-y-5">
                  <SageDiscoveryConversation
                    key={selected.slug}
                    intentSlug={selected.slug}
                    intentName={selected.name}
                    onEnrollmentPrepared={reloadDiscoveryState}
                  />

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
                        {sensitivityLabel(question.sensitivity)}
                        {question.sourcePolicy === "human_only"
                          ? " · you must enter this yourself"
                          : ""}{" "}
                        · retained up to {question.retentionDays} days
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
                      ).some((claims) => claims[question.key] !== undefined) ? (
                        <button
                          type="button"
                          onClick={() =>
                            setClearFields((current) => {
                              const next = new Set(current);
                              if (next.has(question.key))
                                next.delete(question.key);
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
              )}

              {selected.slug !== "hiring_compatibility" &&
              selected.discovery.locationGranularity !== "none" ? (
                <fieldset className="mt-7 rounded-2xl border border-line bg-mist/40 p-4">
                  <legend className="px-1 text-sm font-semibold text-matcha-deep">
                    Coarse location for private matching
                  </legend>
                  <p className="mb-4 text-xs leading-5 text-muted">
                    HoneyMatcha does not accept GPS coordinates. This location
                    remains private until your disclosure policy allows it.
                    Choose a canonical suggestion so spelling and aliases do not
                    create false mismatches. City and neighborhood search text
                    is sent to Geoapify without your HoneyMatcha identity.
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
                        "country" | "region" | "city" | "neighborhood"
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
                {selected.slug !== "hiring_compatibility" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={submitEnrollment}
                    className="rounded-xl bg-matcha-deep px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Save and activate
                  </button>
                ) : null}
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

              {selected.currentEnrollment.status === "active" ? (
                <section
                  className="mt-8 border-t border-line pt-6"
                  aria-labelledby="sage-discovery-title"
                >
                  <h3
                    id="sage-discovery-title"
                    className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep"
                  >
                    {hiringSide
                      ? `Let Sage search for aligned ${hiringTarget}`
                      : "Let Sage search"}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                    {hiringSide
                      ? `This is an agent mandate, not a listing. Sage compares your approved constraints with private ${hiringTarget === "roles" ? "role" : "candidate"} mandates and brings you only credible reasons to talk.`
                      : "Sage uses the enrollment you approved. Results stay anonymous, private answers remain hidden, and Sage cannot request an introduction without you."}
                  </p>
                  {hiringSide ? (
                    <ol className="mt-5 grid overflow-hidden rounded-2xl border border-line bg-white/70 sm:grid-cols-4">
                      {[
                        ["Mandate", "Your private criteria"],
                        ["Scan", `Agent finds ${hiringTarget}`],
                        ["Align", "Agents surface gaps"],
                        ["Meet", "Humans approve a call"],
                      ].map(([label, detail], index) => (
                        <li
                          key={label}
                          className="border-b border-line p-3 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
                        >
                          <span className="font-mono text-[0.65rem] font-bold text-matcha">
                            {String(index + 1).padStart(2, "0")} · {label}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-muted">
                            {detail}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  <button
                    type="button"
                    disabled={
                      busy ||
                      ["pending", "running"].includes(sageJob?.state ?? "")
                    }
                    onClick={askSageToSearch}
                    className="mt-4 rounded-xl bg-matcha-deep px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {["pending", "running"].includes(sageJob?.state ?? "")
                      ? "Sage is searching…"
                      : hiringSide
                        ? `Ask Sage to find aligned ${hiringTarget}`
                        : "Ask Sage to find possibilities"}
                  </button>

                  <div className="mt-5 rounded-2xl border border-matcha-soft/45 bg-matcha-soft/8 p-4">
                    <div className="flex items-start gap-3">
                      <input
                        id={`cadence-${selected.slug}`}
                        type="checkbox"
                        checked={selectedCadence.enabled}
                        disabled={busy}
                        onChange={(event) =>
                          void saveCadence({ enabled: event.target.checked })
                        }
                        className="mt-1 h-4 w-4 accent-matcha"
                      />
                      <label htmlFor={`cadence-${selected.slug}`}>
                        <span className="block text-sm font-semibold text-ink">
                          Let Sage keep looking
                        </span>
                        <span className="mt-1 block text-sm leading-6 text-muted">
                          This is off until you enable it. Sage respects your
                          selected operator, safety status, and one automatic
                          search per day limit.
                        </span>
                      </label>
                    </div>
                    {selectedCadence.enabled ? (
                      <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
                        <label className="grid gap-1.5 text-sm">
                          <span className="font-medium text-ink">Check</span>
                          <select
                            value={selectedCadence.intervalHours}
                            disabled={busy}
                            onChange={(event) =>
                              void saveCadence({
                                intervalHours: Number(event.target.value),
                              })
                            }
                            className="field"
                          >
                            <option value={24}>Daily</option>
                            <option value={72}>Every 3 days</option>
                            <option value={168}>Weekly</option>
                            <option value={336}>Every 2 weeks</option>
                          </select>
                        </label>
                        <label className="grid gap-1.5 text-sm">
                          <span className="font-medium text-ink">At most</span>
                          <select
                            value={selectedCadence.maxRecommendations}
                            disabled={busy}
                            onChange={(event) =>
                              void saveCadence({
                                maxRecommendations: Number(event.target.value),
                              })
                            }
                            className="field"
                          >
                            <option value={1}>1 possibility</option>
                            <option value={3}>3 possibilities</option>
                            <option value={5}>5 possibilities</option>
                            <option value={10}>10 possibilities</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-2 self-end py-2.5 text-sm text-ink">
                          <input
                            type="checkbox"
                            checked={selectedCadence.notifyOnNew}
                            disabled={busy}
                            onChange={(event) =>
                              void saveCadence({
                                notifyOnNew: event.target.checked,
                              })
                            }
                            className="h-4 w-4 accent-matcha"
                          />
                          Notify me when new ones arrive
                        </label>
                      </div>
                    ) : null}
                  </div>

                  {visibleCandidates.length ? (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {visibleCandidates.map((candidate) => (
                        <article
                          key={candidate.recommendationId}
                          className="rounded-2xl border border-line bg-white/70 p-4"
                        >
                          <p className="text-sm font-semibold text-ink">
                            {hiringSide
                              ? "Private fit signal"
                              : "Anonymous possibility"}
                          </p>
                          {Object.keys(candidate.untrustedParticipantData)
                            .length ? (
                            <dl className="mt-3 space-y-2 text-sm">
                              {Object.entries(
                                candidate.untrustedParticipantData,
                              ).map(([key, value]) => (
                                <div key={key}>
                                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                                    {key.replaceAll("_", " ")}
                                  </dt>
                                  <dd className="mt-0.5 text-ink">
                                    {Array.isArray(value)
                                      ? value.join(", ")
                                      : String(value)}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            <p className="mt-2 text-sm text-muted">
                              Private constraints show potential compatibility;
                              no identifying details are available.
                            </p>
                          )}
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => requestSageIntroduction(candidate)}
                              className="rounded-lg border border-matcha px-3 py-2 text-xs font-semibold text-matcha disabled:opacity-50"
                            >
                              Ask Sage to prepare introduction
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void dismissRecommendation(
                                  candidate.recommendationId,
                                )
                              }
                              className="rounded-lg px-3 py-2 text-xs font-semibold text-muted disabled:opacity-50"
                            >
                              Not for me
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-5 rounded-2xl border border-dashed border-line px-4 py-5 text-sm leading-6 text-muted">
                      {hiringSide
                        ? `No ${hiringTarget} are waiting yet. Run a private scan now or let Sage keep looking on a cadence.`
                        : "No anonymous possibilities are waiting right now."}
                    </p>
                  )}
                </section>
              ) : null}
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
                  key={
                    interest.id ??
                    `${interest.intentSlug}-${interest.createdAt}`
                  }
                  className="rounded-2xl border border-line bg-white/70 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {interest.intentSlug === "dating_introduction"
                          ? "Dating introduction"
                          : interest.intentSlug.replaceAll("_", " ")}
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
                          onClick={() =>
                            interestAction(interest.id!, "decline")
                          }
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
                  {interest.intentSlug === "hiring_compatibility" ? (
                    <div className="mt-3 rounded-xl bg-mist p-3 text-sm leading-6 text-muted">
                      <p>
                        {String(
                          interest.compatibility.note ??
                            "The private fit signal remains sealed until both people approve.",
                        )}
                      </p>
                      {interest.status === "accepted" && interest.disclosure ? (
                        <div className="mt-3 border-t border-line pt-3">
                          <p className="text-xs font-bold tracking-[0.08em] text-matcha uppercase">
                            Approved introduction details
                          </p>
                          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                            {Object.entries(
                              (interest.disclosure.untrustedParticipantData as
                                Record<string, unknown> | undefined) ?? {},
                            ).map(([key, value]) => (
                              <div key={key}>
                                <dt className="text-xs font-semibold text-muted">
                                  {key.replaceAll("_", " ")}
                                </dt>
                                <dd className="text-ink">
                                  {Array.isArray(value)
                                    ? value.join(", ")
                                    : String(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                          <div className="mt-4 rounded-xl border border-matcha-soft/35 bg-white/75 p-3">
                            <p className="text-sm font-semibold text-matcha-deep">
                              Ready for the agents to coordinate a call
                            </p>
                            <p className="mt-1 text-xs leading-5 text-muted">
                              Your agent can compare free and busy time, propose
                              a call, and pause for both people&apos;s final
                              approval.
                            </p>
                            <div className="mt-3">
                              <CopyBlock
                                text="Review my accepted HoneyMatcha recruiting introduction, then use request_schedule_meeting to coordinate a call. Show me the proposed time and wait for my approval before anything is booked."
                                label="Copy call handoff for my agent"
                              />
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <pre className="mt-3 overflow-x-auto rounded-xl bg-mist p-3 text-xs leading-5 text-muted">
                      {JSON.stringify(
                        interest.status === "accepted"
                          ? interest.disclosure
                          : interest.compatibility,
                        null,
                        2,
                      )}
                    </pre>
                  )}
                  {interest.id ? (
                    <div className="mt-3 flex gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => interestAction(interest.id!, "block")}
                        disabled={busy}
                        className="font-semibold text-muted disabled:opacity-60"
                      >
                        Block
                      </button>
                      <button
                        type="button"
                        onClick={() => interestAction(interest.id!, "report")}
                        disabled={busy}
                        className="font-semibold text-danger disabled:opacity-60"
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
            <li>
              Both people approve before introduction fields are released.
            </li>
            <li>Blocking overrides matching and revokes disclosure.</li>
          </ul>
        </section>
        <section className="surface-card p-5">
          <h2 className="font-semibold text-matcha-deep">
            Recent privacy events
          </h2>
          <div className="mt-4 space-y-3">
            {audit.length ? (
              audit.slice(0, 12).map((item) => (
                <div
                  key={item.id}
                  className="border-b border-line pb-3 text-xs"
                >
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
