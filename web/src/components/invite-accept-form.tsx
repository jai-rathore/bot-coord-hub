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
    startTransition(() => router.push("/app/links"));
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={accept}
        className="cursor-pointer rounded-md border border-matcha-deep bg-matcha-deep px-4 py-2 text-sm font-semibold text-[#f7faf6] disabled:opacity-60"
      >
        Accept and link
      </button>
      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
