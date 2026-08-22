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
  const [busyId, setBusyId] = useState<string | null>(null);

  function decide(id: string, decision: "approved" | "denied") {
    setError(null);
    setBusyId(id);
    // The await lives inside the transition so `pending` covers the request
    // itself, not just the refresh that follows it. Otherwise the buttons stay
    // live and unchanged for the whole round trip.
    startTransition(async () => {
      try {
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
        router.refresh();
      } catch {
        setError("Failed to update confirmation");
      } finally {
        setBusyId(null);
      }
    });
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
          You&apos;re all caught up. When your assistant needs your OK—like
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
                  className="button-primary min-h-9 cursor-pointer px-3 py-1.5 text-sm disabled:opacity-60"
                >
                  {busyId === confirm.id ? "Saving…" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => decide(confirm.id, "denied")}
                  className="cursor-pointer rounded-md border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger disabled:opacity-60"
                >
                  {busyId === confirm.id ? "Saving…" : "Decline"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
