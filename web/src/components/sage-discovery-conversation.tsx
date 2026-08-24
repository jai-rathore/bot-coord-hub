"use client";

import { useEffect, useMemo, useState } from "react";

type SageThread = {
  id: string;
  intentSlug: string;
  state: string;
  latestJobId: string | null;
  draft: {
    claims: Record<string, unknown>;
    coarseLocation: { label: string; granularity: string } | null;
    claimLocations: Record<
      string,
      Array<{ label: string; granularity: string }>
    >;
  };
  missingFields: string[];
  questions: Array<{
    key: string;
    prompt: string;
    required: boolean;
    sensitivity: string;
    sourcePolicy: string;
  }>;
  matchingLocationGranularity: string;
  locationChoices: Array<{
    target: string;
    query: string;
    resolutionToken: string;
    label: string;
    granularity: string;
  }>;
  messages: Array<{
    id: string;
    role: string;
    body: string;
    createdAt: string;
  }>;
};

type PublicJob = { id: string; state: string; lastError?: string | null };

function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function SageDiscoveryConversation({
  intentSlug,
  intentName,
  onEnrollmentPrepared,
}: {
  intentSlug: string;
  intentName: string;
  onEnrollmentPrepared: () => Promise<void>;
}) {
  const [thread, setThread] = useState<SageThread | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const questionByKey = useMemo(
    () => new Map(thread?.questions.map((question) => [question.key, question])),
    [thread],
  );

  async function loadThread() {
    const response = await fetch(
      `/api/sage/discovery?intentSlug=${encodeURIComponent(intentSlug)}`,
      { cache: "no-store" },
    );
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      thread?: SageThread;
    };
    if (!response.ok || !data.thread) {
      throw new Error(data.error ?? "Sage conversation could not be loaded");
    }
    setThread(data.thread);
    return data.thread;
  }

  useEffect(() => {
    let cancelled = false;
    void fetch(
      `/api/sage/discovery?intentSlug=${encodeURIComponent(intentSlug)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          thread?: SageThread;
        };
        if (!response.ok || !data.thread) {
          throw new Error(data.error ?? "Sage conversation could not be loaded");
        }
        return data.thread;
      })
      .then((nextThread) => {
        if (!cancelled) setThread(nextThread);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Request failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [intentSlug]);

  async function pollJob(jobId: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      const response = await fetch("/api/sage/jobs", { cache: "no-store" });
      if (!response.ok) continue;
      const data = (await response.json()) as { jobs?: PublicJob[] };
      const job = data.jobs?.find((candidate) => candidate.id === jobId);
      if (!job || ["pending", "running"].includes(job.state)) continue;
      if (["failed", "dead_letter"].includes(job.state)) {
        throw new Error(job.lastError ?? "Sage could not finish this turn");
      }
      await loadThread();
      return job;
    }
    throw new Error("Sage is still working. Your conversation is saved safely.");
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const clientMessageId = crypto.randomUUID();
    try {
      const response = await fetch("/api/sage/discovery", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": clientMessageId,
        },
        body: JSON.stringify({
          action: "message",
          intentSlug,
          message: text,
          clientMessageId,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        job?: PublicJob;
      };
      if (!response.ok || !data.job) {
        throw new Error(data.error ?? "Sage could not take this message");
      }
      setMessage("");
      await loadThread();
      await pollJob(data.job.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function chooseLocation(choice: SageThread["locationChoices"][number]) {
    if (!thread) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/sage/discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "select_location",
          intentSlug,
          threadId: thread.id,
          target: choice.target,
          resolutionToken: choice.resolutionToken,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        thread?: SageThread;
      };
      if (!response.ok || !data.thread) {
        throw new Error(data.error ?? "Location could not be selected");
      }
      setThread(data.thread);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function prepareReview() {
    if (!thread) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const idempotencyKey = crypto.randomUUID();
    try {
      const response = await fetch("/api/sage/discovery", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          action: "prepare_review",
          intentSlug,
          threadId: thread.id,
          idempotencyKey,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        job?: PublicJob;
      };
      if (!response.ok || !data.job) {
        throw new Error(data.error ?? "Sage could not prepare the review");
      }
      await pollJob(data.job.id);
      await onEnrollmentPrepared();
      setNotice(
        "Sage prepared the snapshot below. Review every value, then approve it yourself.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-matcha-soft/40 bg-matcha/5 p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-matcha">
        Talk with Sage
      </p>
      <h3 className="mt-1 font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
        Describe your {intentName.toLowerCase()} goal
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted">
        Sage records only what you state, asks for missing details, and prepares
        a review. Your messages and draft are encrypted. Nothing becomes active
        until you approve the exact snapshot.
      </p>

      {thread?.messages.length ? (
        <ol className="mt-4 max-h-80 space-y-2 overflow-y-auto" aria-live="polite">
          {thread.messages.map((item) => (
            <li
              key={item.id}
              className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-6 ${
                item.role === "human"
                  ? "ml-auto bg-matcha-deep text-white"
                  : "border border-line bg-white text-ink"
              }`}
            >
              {item.body}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-xl border border-line bg-white px-3 py-2 text-sm text-muted">
          Start naturally. For example, say whether you are hiring or looking,
          hosting or attending, or what kind of introduction you want.
        </p>
      )}

      <form onSubmit={sendMessage} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`sage-discovery-${intentSlug}`}>
          Message Sage about {intentName}
        </label>
        <textarea
          id={`sage-discovery-${intentSlug}`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={2_000}
          rows={2}
          placeholder="Tell Sage what you are looking for"
          className="min-h-16 flex-1 rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-matcha"
        />
        <button
          type="submit"
          disabled={busy || !message.trim()}
          className="rounded-xl bg-matcha-deep px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Sage is working…" : "Send"}
        </button>
      </form>

      {thread?.locationChoices.length ? (
        <div className="mt-4 rounded-xl border border-honey/60 bg-honey/10 p-3">
          <p className="text-sm font-semibold text-matcha-deep">
            Choose the place you meant
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {thread.locationChoices.map((choice) => (
              <button
                key={`${choice.target}:${choice.resolutionToken}`}
                type="button"
                disabled={busy}
                onClick={() => chooseLocation(choice)}
                className="rounded-full border border-matcha bg-white px-3 py-2 text-xs font-semibold text-matcha"
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {thread &&
      (Object.keys(thread.draft.claims).length > 0 ||
        thread.draft.coarseLocation ||
        Object.keys(thread.draft.claimLocations).length > 0) ? (
        <div className="mt-4 rounded-xl border border-line bg-white p-3">
          <p className="text-sm font-semibold text-ink">Current draft</p>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(thread.draft.claims).map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-semibold text-muted">
                  {questionByKey.get(key)?.prompt ?? key.replaceAll("_", " ")}
                </dt>
                <dd className="mt-0.5 text-ink">{displayValue(value)}</dd>
              </div>
            ))}
            {thread.draft.coarseLocation ? (
              <div>
                <dt className="text-xs font-semibold text-muted">
                  Private matching location
                </dt>
                <dd className="mt-0.5 text-ink">
                  {thread.draft.coarseLocation.label}
                </dd>
              </div>
            ) : null}
            {Object.entries(thread.draft.claimLocations).flatMap(
              ([key, locations]) =>
                locations.map((location) => (
                  <div key={`${key}:${location.label}`}>
                    <dt className="text-xs font-semibold text-muted">
                      {questionByKey.get(key)?.prompt ?? key.replaceAll("_", " ")}
                    </dt>
                    <dd className="mt-0.5 text-ink">{location.label}</dd>
                  </div>
                )),
            )}
          </dl>
        </div>
      ) : null}

      {thread?.missingFields.length ? (
        <div className="mt-4 text-sm text-muted">
          <p className="font-semibold text-ink">Still needed</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {thread.missingFields.map((key) => (
              <li key={key}>
                {key === "matchingLocation"
                  ? `Your coarse ${thread.matchingLocationGranularity} for private matching`
                  : questionByKey.get(key)?.prompt ?? key.replaceAll("_", " ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {thread && thread.missingFields.length === 0 ? (
        <button
          type="button"
          disabled={busy || thread.locationChoices.length > 0}
          onClick={prepareReview}
          className="mt-4 rounded-xl border border-matcha px-4 py-2.5 text-sm font-semibold text-matcha disabled:opacity-50"
        >
          {busy ? "Preparing review…" : "Prepare my enrollment for review"}
        </button>
      ) : null}

      {notice ? (
        <p className="mt-4 rounded-xl border border-matcha-soft/40 bg-white px-3 py-2 text-sm text-matcha">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
