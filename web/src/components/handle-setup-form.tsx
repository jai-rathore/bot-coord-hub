"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { handleError } from "@/lib/handles";

export function HandleSetupForm({
  suggestedHandle,
  email,
  displayName,
}: {
  suggestedHandle: string;
  email: string;
  displayName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [handle, setHandle] = useState(suggestedHandle);
  const [headline, setHeadline] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const localError = useMemo(
    () => handleError(handle, email),
    [email, handle],
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (localError) {
      setError(localError);
      return;
    }
    // The await runs inside the transition so `pending` covers the
    // request, not just what follows it.
    startTransition(async () => {
      try {
        const response = await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handle,
            displayName: displayName || undefined,
            headline: headline.trim() || undefined,
            websiteUrl: websiteUrl.trim() || undefined,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? "Could not claim that handle");
          return;
        }
        router.replace("/");
      } catch {
        setError("Could not claim that handle");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-ink">Your public handle</span>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white/80 px-3 py-2">
          <span className="text-sm text-muted">honeymatcha.io/</span>
          <input
            value={handle}
            onChange={(event) => setHandle(event.target.value.toLowerCase())}
            autoComplete="off"
            spellCheck={false}
            className="min-w-[10rem] flex-1 border-0 bg-transparent py-1 font-mono text-base text-ink outline-none"
            placeholder="your-name"
            required
          />
        </div>
        <span className="text-xs text-muted">
          This becomes your lasting agent address. You cannot change it later.
        </span>
      </label>
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-ink">One-line intro (optional)</span>
        <input
          value={headline}
          onChange={(event) => setHeadline(event.target.value)}
          maxLength={160}
          className="field"
          placeholder="Let my assistant coordinate meetings through HoneyMatcha."
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-ink">Website (optional)</span>
        <input
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
          className="field"
          placeholder="https://your-site.com"
        />
      </label>
      {error || localError ? (
        <p className="text-sm font-medium text-danger" role="alert">
          {error ?? localError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || Boolean(localError)}
        className="button-primary cursor-pointer disabled:opacity-60"
      >
        {pending ? "Saving…" : "Claim this address"}
      </button>
    </form>
  );
}
