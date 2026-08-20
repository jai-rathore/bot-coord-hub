"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SageAvatar } from "@/components/sage-avatar";

/**
 * Name the agent that came with the account.
 *
 * Renaming is the smallest thing that makes "your agent" true rather than
 * asserted — the name is stamped on each event at creation, so it is what the
 * other people on that event see it called.
 */
export function AgentNameForm({
  initialName,
  defaultName,
}: {
  initialName: string;
  defaultName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/agent-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save that name.");
        return;
      }
      setName(data.name ?? defaultName);
      setSaved(true);
      startTransition(() => router.refresh());
    } catch {
      setError("Could not reach HoneyMatcha. Check your connection.");
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="flex items-center gap-3">
        <SageAvatar size={44} />
        <div className="min-w-0 flex-1">
          <label
            htmlFor="agent-name"
            className="block text-sm font-medium text-ink"
          >
            What your agent is called
          </label>
          <input
            id="agent-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={32}
            placeholder={defaultName}
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>
      <p className="text-xs leading-5 text-muted">
        Events you create from now on will use this name, and it is what the
        people on them see. Leave it empty to go back to {defaultName}.
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {saved ? (
        <p className="text-sm font-semibold text-matcha">Saved.</p>
      ) : null}
      <button type="submit" className="button-secondary" disabled={pending}>
        Save name
      </button>
    </form>
  );
}
