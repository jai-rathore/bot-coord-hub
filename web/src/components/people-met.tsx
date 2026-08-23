"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { MetPerson } from "@/lib/people";

/**
 * People you have coordinated with but never connected to.
 *
 * The row is deliberately quiet about what it grants, because it grants
 * nothing. Connect starts the same email invite the form above sends: the
 * other person still has to accept, and nothing about sharing an event has
 * given you a shortcut past that.
 */
export function PeopleMet({ people }: { people: MetPerson[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function connect(person: MetPerson) {
    setBusyId(person.userId);
    setError(null);
    // Inside the transition so the row stays busy through the refresh, not
    // just until the POST returns.
    startTransition(async () => {
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toEmail: person.email,
          toName: person.name ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not send that invitation.");
        return;
      }
      setInvited((current) => new Set(current).add(person.userId));
      router.refresh();
    } catch {
      setError("Could not reach HoneyMatcha. Check your connection.");
    } finally {
      setBusyId(null);
    }
    });
  }

  if (people.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
        Met through your events
      </h2>
      <p className="text-sm leading-6 text-muted">
        People you have been on an event with. They are here so you can find
        them again: being listed grants nothing on its own.
      </p>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <ul className="space-y-2">
        {people.map((person) => (
          <li
            key={person.userId}
            className="surface-card flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                <span className="truncate">{person.name ?? person.email}</span>
                {person.agentConnected ? <AgentBadge /> : null}
              </p>
              <p className="mt-1 text-sm text-muted">
                {person.youOrganized ? "Your event" : "Their event"} ·{" "}
                <span className="text-ink">{person.viaEventTitle}</span>
              </p>
            </div>
            {invited.has(person.userId) ? (
              <span className="text-sm font-semibold text-matcha">
                Invitation sent
              </span>
            ) : (
              <button
                type="button"
                className="button-secondary"
                disabled={busyId === person.userId || pending}
                onClick={() => connect(person)}
              >
                Connect
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Says this person can be coordinated with agent to agent.
 *
 * It reports a capability, never activity: whether they have an agent, not
 * what it has been doing or when it last ran.
 */
export function AgentBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-matcha-soft/15 px-2 py-0.5 text-[0.62rem] font-bold tracking-[0.06em] text-matcha uppercase"
      title="This person has connected an agent"
    >
      <span className="live-dot bg-matcha" aria-hidden="true" />
      Has an agent
    </span>
  );
}
