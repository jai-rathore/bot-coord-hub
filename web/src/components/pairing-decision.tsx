"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function PairingDecision({ userCode }: { userCode: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approved" | "denied" | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "approved" | "denied") {
    setPending(decision);
    setError(null);
    // Inside a transition, so `pending` is held until the refreshed page has
    // rendered rather than being dropped the moment the request returns. The
    // finally clears it on every path — previously a successful decision left
    // the button stuck reading "Connecting…" indefinitely.
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/pairings/${encodeURIComponent(userCode)}/decision`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision }),
          },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? "Could not decide this connection");
          return;
        }
        router.refresh();
      } catch {
        setError("Could not decide this connection");
      } finally {
        setPending(null);
      }
    });
  }

  return (
    <div className="mt-6">
      {error ? (
        <p className="mb-3 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => decide("approved")}
          className="button-primary cursor-pointer disabled:opacity-60"
        >
          {pending === "approved" ? "Connecting…" : "Connect this agent"}
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => decide("denied")}
          className="rounded-md border border-line px-4 py-2.5 text-sm font-medium text-muted disabled:opacity-60"
        >
          {pending === "denied" ? "Declining…" : "Not mine"}
        </button>
      </div>
    </div>
  );
}
