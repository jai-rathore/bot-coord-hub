"use client";

import { useState } from "react";

type SupportedTask = {
  slug: string;
  name: string;
  description: string | null;
};

export function TaskRequestForm({
  supportedTasks,
}: {
  supportedTasks: SupportedTask[];
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function requestTask(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/intents/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      const similar = Array.isArray(data.hits)
        ? ` Similar requests: ${data.hits
            .slice(0, 3)
            .map((hit: { name?: string }) => hit.name)
            .filter(Boolean)
            .join(", ")}.`
        : "";
      setError(`${data.error ?? "Could not send request"}${similar}`);
      return;
    }
    setMessage(
      `Thanks—we recorded “${data.proposal.name}” for product review.`,
    );
    setName("");
    setDescription("");
  }

  async function copyPrompt(task: SupportedTask) {
    const prompt =
      task.slug === "schedule_meeting"
        ? "Use HoneyMatcha to schedule a meeting with [person] sometime next week."
        : task.slug === "hiring_compatibility"
          ? "Use HoneyMatcha to privately check hiring compatibility with [candidate email]. Ask me for the role's compensation ceiling, locations, work modes, sponsorship availability, latest start date, and levels before creating the request."
        : `Use HoneyMatcha to ${task.name.toLowerCase()}.`;
    await navigator.clipboard.writeText(prompt);
    setCopied(task.slug);
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
          What HoneyMatcha can do
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {supportedTasks.map((task) => (
            <article
              key={task.slug}
              className="rounded-2xl border border-line bg-white/70 p-5"
            >
              <h3 className="font-semibold text-ink">{task.name}</h3>
              {task.description ? (
                <p className="mt-2 text-sm leading-6 text-muted">
                  {task.description}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => copyPrompt(task)}
                className="mt-4 text-sm font-semibold text-matcha-deep"
              >
                {copied === task.slug
                  ? "Copied—paste it to your agent"
                  : "Copy a prompt for your agent"}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white/55 p-5 sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-matcha">
          Help shape HoneyMatcha
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
          Request a new task
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          Tell us what back-and-forth you want your agent to handle. Requests
          are reviewed before they become a supported capability.
        </p>
        <form onSubmit={requestTask} className="mt-5 max-w-xl space-y-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">What should your agent do?</span>
            <input
              name="task-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={3}
              maxLength={120}
              placeholder="For example: coordinate an interview panel"
              className="rounded-md border border-line bg-white px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-matcha"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">
              What outcome would make it useful?
            </span>
            <textarea
              name="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2_000}
              rows={4}
              placeholder="Describe who is involved, what takes time today, and when you would want to step in."
              className="rounded-md border border-line bg-white px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-matcha"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          {message ? (
            <p role="status" className="text-sm font-medium text-matcha-deep">
              {message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-matcha-deep px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Sending…" : "Request this task"}
          </button>
        </form>
      </section>
    </div>
  );
}
