"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function InviteAcceptForm({ inviteCode }: { inviteCode: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setError(null);
    const res = await fetch("/api/links/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to accept invite");
      return;
    }
    startTransition(() => router.push("/app/people"));
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={accept}
        className="button-primary cursor-pointer disabled:opacity-60"
      >
        Accept connection
      </button>
      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
