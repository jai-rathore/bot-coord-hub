"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function PairingDecision({ userCode }: { userCode: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "approved" | "denied") {
    setBusy(decision);
    setError(null);
    // `pending` from the transition stays true through the request and the
    // refresh. `busy` is only the label, and is cleared in finally so a
    // failed decision does not leave the button reading "Connecting…".
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
        setBusy(null);
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
          disabled={pending}
          onClick={() => decide("approved")}
          className="button-primary cursor-pointer disabled:opacity-60"
        >
          {busy === "approved" ? "Connecting…" : "Connect this agent"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("denied")}
          className="rounded-md border border-line px-4 py-2.5 text-sm font-medium text-muted disabled:opacity-60"
        >
          {busy === "denied" ? "Declining…" : "Not mine"}
        </button>
      </div>
    </div>
  );
}
