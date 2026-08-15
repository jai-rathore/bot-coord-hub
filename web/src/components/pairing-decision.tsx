"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PairingDecision({ userCode }: { userCode: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "denied") {
    setPending(decision);
    setError(null);
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
      setPending(null);
      return;
    }
    router.refresh();
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
