"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PublicConfirm } from "@/lib/confirms";

export function ConfirmQueue({
  initialConfirms,
}: {
  initialConfirms: PublicConfirm[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, decision: "approved" | "denied") {
    setError(null);
    const res = await fetch(`/api/confirms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to update confirmation");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      {initialConfirms.length === 0 ? (
        <p className="text-sm text-muted">
          You&apos;re all caught up. When your Grok Bot needs your OK—like
          confirming a meeting—it appears here.
        </p>
      ) : (
        <ul className="divide-y divide-line border-t border-b border-line">
          {initialConfirms.map((confirm) => (
            <li
              key={confirm.id}
              className="flex flex-wrap items-start justify-between gap-4 py-4"
            >
              <div className="max-w-xl">
                <p className="font-semibold text-ink">
                  {confirm.action === "book_meeting"
                    ? "Book this meeting"
                    : confirm.action.replace(/[_-]+/g, " ")}
                </p>
                {confirm.note && (
                  <p className="mt-1 text-sm text-muted">{confirm.note}</p>
                )}
                <p className="mt-2 text-xs text-muted">
                  Session {confirm.session?.intentType ?? confirm.sessionId} ·{" "}
                  {new Date(confirm.createdAt).toLocaleString()}
                </p>
                {Object.keys(confirm.metadata ?? {}).length > 0 ? (
                  <details className="mt-3 text-xs text-muted">
                    <summary className="cursor-pointer font-medium text-matcha-deep">
                      Technical details
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded bg-code-bg p-2 text-xs text-matcha-deep">
                      {JSON.stringify(confirm.metadata, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => decide(confirm.id, "approved")}
                  className="cursor-pointer rounded-md border border-matcha-deep bg-matcha-deep px-3 py-1.5 text-sm font-semibold text-[#f7faf6] disabled:opacity-60"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => decide(confirm.id, "denied")}
                  className="cursor-pointer rounded-md border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger disabled:opacity-60"
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
