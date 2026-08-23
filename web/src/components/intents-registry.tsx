"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { IntentRegistryItem } from "@/lib/intents";

type DedupeHit = {
  slug: string;
  name: string;
  status: string;
  source: string;
};

/** Long enough to skip mid-word keystrokes, short enough to feel live. */
const DEDUPE_DEBOUNCE_MS = 300;

export function IntentsRegistry({
  initialItems,
  canPropose,
}: {
  initialItems: Array<
    Omit<IntentRegistryItem, "createdAt" | "triagedAt"> & {
      createdAt: string;
      triagedAt: string | null;
    }
  >;
  canPropose: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const dedupeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dedupeAbort = useRef<AbortController | null>(null);
  const [dedupeHits, setDedupeHits] = useState<DedupeHit[]>([]);
  const [force, setForce] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const supported = initialItems.filter((item) => item.status === "live");
    if (!q) return supported;
    return supported.filter((item) =>
      `${item.name} ${item.slug} ${item.description ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [initialItems, query]);

  /**
   * Debounced and abortable: this used to fire a request on every keystroke,
   * and slow responses could land out of order and overwrite newer hits.
   */
  function checkDedupe(nextName: string) {
    if (dedupeTimer.current) clearTimeout(dedupeTimer.current);
    dedupeAbort.current?.abort();

    if (!nextName.trim()) {
      setDedupeHits([]);
      return;
    }

    dedupeTimer.current = setTimeout(async () => {
      const controller = new AbortController();
      dedupeAbort.current = controller;
      try {
        const params = new URLSearchParams({ name: nextName });
        const res = await fetch(`/api/intents/dedupe?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        setDedupeHits(data.hits ?? []);
      } catch {
        // An aborted or failed lookup is advisory only; leave the hits as-is.
      }
    }, DEDUPE_DEBOUNCE_MS);
  }

  function submitProposal(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // The await runs inside the transition so `pending` covers the
    // request, not just what follows it.
    startTransition(async () => {
      try {
        const res = await fetch("/api/intents/propose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description,
            force,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.hits) setDedupeHits(data.hits);
          setError(data.error ?? "Failed to submit proposal");
          return;
        }
        setSuccess(
          `Thanks. We recorded “${data.proposal.name}” for product review.`,
        );
        setName("");
        setDescription("");
        setForce(false);
        setDedupeHits([]);
        router.refresh();
      } catch {
        setError("Failed to submit proposal");
      }
    });
  }

  return (
    <div className="space-y-10">
      <label className="grid max-w-md gap-1 text-sm">
        <span className="font-medium text-ink">Search supported tasks</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          name="task-search"
          placeholder="For example: scheduling"
          className="field"
        />
      </label>

      <section>
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          Supported tasks
        </h2>
        {filtered.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No supported tasks match.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line border-t border-b border-line">
            {filtered.map((item) => (
              <li key={`${item.source}-${item.id}`} className="py-4">
                <h3 className="font-semibold text-ink">{item.name}</h3>
                {item.description && (
                  <p className="mt-1 text-sm text-muted">{item.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          Request a new task
        </h2>
        {!canPropose ? (
          <p className="mt-2 text-sm text-muted">
            Sign in to tell us what you want your assistant to handle next.
          </p>
        ) : (
          <form onSubmit={submitProposal} className="mt-4 max-w-lg space-y-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">
                What should your assistant handle?
              </span>
              <input
                required
                value={name}
                onChange={(e) => {
                  const v = e.target.value;
                  setName(v);
                  checkDedupe(v);
                }}
                name="requested-task"
                placeholder="For example: coordinate an interview panel"
                className="field"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">
                What outcome would make this useful?
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                name="requested-task-outcome"
                maxLength={2_000}
                className="field"
              />
            </label>

            {dedupeHits.length > 0 && (
              <div className="rounded-md border border-honey bg-[rgba(232,210,154,0.28)] p-3 text-sm">
                <p className="font-semibold text-matcha-deep">
                  Similar tasks already exist
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
                  {dedupeHits.slice(0, 6).map((hit) => (
                    <li key={`${hit.source}-${hit.slug}`}>
                      {hit.name}
                    </li>
                  ))}
                </ul>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={force}
                    onChange={(e) => setForce(e.target.checked)}
                  />
                  My request is meaningfully different
                </label>
              </div>
            )}

            {error && (
              <p className="text-sm font-medium text-danger" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="text-sm font-medium text-matcha-deep">{success}</p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="button-primary cursor-pointer disabled:opacity-60"
            >
              Request this task
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
