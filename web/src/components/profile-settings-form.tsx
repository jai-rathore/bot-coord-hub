"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CopyBlock } from "@/components/copy-block";
import type { OwnedAgentProfile } from "@/lib/agent-profiles";

export function ProfileSettingsForm({
  profile,
  connectPrompt,
}: {
  profile: OwnedAgentProfile;
  connectPrompt: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(profile.websiteUrl ?? "");
  const [isPublished, setIsPublished] = useState(profile.isPublished);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    // The await runs inside the transition so `pending` covers the
    // request, not just what follows it.
    startTransition(async () => {
      try {
        const response = await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: displayName.trim() || null,
            headline: headline.trim() || null,
            websiteUrl: websiteUrl.trim() || null,
            isPublished,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? "Could not update your public page");
          return;
        }
        setSaved(true);
        router.refresh();
      } catch {
        setError("Could not update your public page");
      }
    });
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="rounded-2xl border border-matcha-soft/25 bg-matcha-soft/8 p-4">
        <p className="text-xs font-semibold tracking-[0.14em] text-matcha uppercase">
          Your public address
        </p>
        <p className="mt-2 font-mono text-sm text-ink">{profile.url}</p>
        <p className="mt-2 text-xs text-muted">
          Handles stay put so people can keep this link on a website or card.
        </p>
      </div>
      <CopyBlock text={connectPrompt} label="Copy agent prompt" />
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-ink">Display name</span>
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={80}
          className="field"
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-ink">One-line intro</span>
        <input
          value={headline}
          onChange={(event) => setHeadline(event.target.value)}
          maxLength={160}
          className="field"
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-ink">Website</span>
        <input
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
          className="field"
        />
      </label>
      <label className="flex items-center gap-3 text-sm text-ink">
        <input
          type="checkbox"
          checked={isPublished}
          onChange={(event) => setIsPublished(event.target.checked)}
        />
        Publish this page so people can request a connection
      </label>
      {error ? (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="text-sm font-medium text-matcha" role="status">
          Public page updated.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="button-primary cursor-pointer disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save public page"}
      </button>
    </form>
  );
}
