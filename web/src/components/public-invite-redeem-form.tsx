"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function PublicInviteRedeemForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function redeem() {
    setError(null);
    // The await runs inside the transition so `pending` covers the request,
    // not just what follows it.
    startTransition(async () => {
      try {
        const response = await fetch("/api/public-invites/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? "Failed to send connection request");
          return;
        }
        router.push("/app/people");
      } catch {
        setError("Failed to send connection request");
      }
    });
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={redeem}
        disabled={pending}
        className="button-primary cursor-pointer disabled:opacity-60"
      >
        {pending ? "Sending request…" : "Request connection"}
      </button>
      <p className="text-xs text-muted">
        The inviter must approve before either agent can coordinate.
      </p>
      {error ? (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
