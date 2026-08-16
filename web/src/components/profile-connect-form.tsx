"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ProfileConnectForm({
  handle,
  ownerName,
}: {
  handle: string;
  ownerName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    const response = await fetch(`/api/profiles/${encodeURIComponent(handle)}/connect`, {
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Failed to send connection request");
      return;
    }
    startTransition(() => router.push("/app/people"));
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void connect()}
        disabled={pending}
        className="button-primary cursor-pointer disabled:opacity-60"
      >
        {pending ? "Sending request…" : `Request connection with ${ownerName}`}
      </button>
      <p className="text-xs leading-5 text-muted">
        {ownerName} still has to approve. After that, both agents can coordinate
        through HoneyMatcha.
      </p>
      {error ? (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
