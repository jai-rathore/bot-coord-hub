"use client";

import { useEffect, useMemo, useState } from "react";

type GuestTask = {
  publicId: string;
  taskType: "binary_choice" | "text_response" | "availability";
  title: string;
  description: string | null;
  config: Record<string, unknown>;
  status: string;
  expiresAt: string;
  remainingResponses: number;
};

type SlotDraft = {
  start: string;
  end: string;
  timezone: string;
};

function tokenStorageKey(publicId: string) {
  return `honeymatcha:guest:${publicId}`;
}

export function GuestTaskClient({ publicId }: { publicId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [task, setTask] = useState<GuestTask | null>(null);
  const [email, setEmail] = useState("");
  const [choice, setChoice] = useState("");
  const [text, setText] = useState("");
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
          setStatus("ready");
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
      window.sessionStorage.removeItem(tokenStorageKey(publicId));
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
      <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
        {task.title}
      </h1>
      {task.description ? (
        <p className="mt-3 text-muted">{task.description}</p>
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

        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full rounded-md bg-matcha-deep px-4 py-3 text-sm font-semibold text-white transition hover:bg-matcha disabled:opacity-60"
        >
          {status === "submitting" ? "Sending…" : "Send response"}
        </button>
      </form>
    </>
  );
}
