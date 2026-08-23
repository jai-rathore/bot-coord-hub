"use client";

import { useState } from "react";
import type { AgentOperatorMode } from "@/lib/sage/job-store";

const OPTIONS: Array<{
  value: AgentOperatorMode;
  label: string;
  description: string;
}> = [
  {
    value: "sage_primary",
    label: "Sage primary",
    description: "Sage handles HoneyMatcha work; your connected agent can still act when you ask it.",
  },
  {
    value: "external_primary",
    label: "My agent primary",
    description: "Your connected agent gets first chance; Sage is the fallback when none is connected.",
  },
  {
    value: "sage_only",
    label: "Sage only",
    description: "Only Sage picks up automatic HoneyMatcha work.",
  },
];

export function AgentOperatorControl({
  initialMode,
}: {
  initialMode: AgentOperatorMode;
}) {
  const [mode, setMode] = useState(initialMode);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function update(next: AgentOperatorMode) {
    const previous = mode;
    setMode(next);
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/sage/operator", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
    setPending(false);
    if (!response.ok) {
      setMode(previous);
      setMessage("Could not save that preference.");
      return;
    }
    setMessage("Saved.");
  }

  const selected = OPTIONS.find((option) => option.value === mode)!;
  return (
    <section aria-labelledby="operator-title">
      <h2
        id="operator-title"
        className="font-[family-name:var(--font-fraunces)] text-xl font-semibold tracking-[-0.02em] text-matcha-deep"
      >
        Who picks up your work
      </h2>
      <div className="mt-3 max-w-xl">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">Primary operator</span>
          <select
            value={mode}
            disabled={pending}
            onChange={(event) => void update(event.target.value as AgentOperatorMode)}
            className="rounded-md border border-line bg-white px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-matcha disabled:opacity-60"
          >
            {OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-sm leading-6 text-muted">{selected.description}</p>
        {message ? (
          <p role="status" className="mt-1 text-xs font-medium text-matcha-deep">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
