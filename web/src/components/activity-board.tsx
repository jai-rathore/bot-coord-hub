"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { PublicMessage, PublicSession } from "@/lib/sessions";
import {
  collapseActivityMessages,
  sessionPeerLabel,
  sessionStatusForHuman,
  sessionTitle,
  sharePrompt,
  visibleActivitySessions,
} from "@/lib/activity-copy";

export function ActivityBoard({
  initialSessions,
  initialSelectedId,
}: {
  initialSessions: PublicSession[];
  initialSelectedId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [showStopped, setShowStopped] = useState(false);
  const [requestedSelectedId, setRequestedSelectedId] = useState<string | null>(
    initialSessions.some((session) => session.id === initialSelectedId)
      ? (initialSelectedId ?? null)
      : (initialSessions[0]?.id ?? null),
  );
  const [loadedMessages, setLoadedMessages] = useState<{
    sessionId: string;
    items: PublicMessage[];
  } | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const visibleSessions = useMemo(
    () => visibleActivitySessions(initialSessions, showStopped),
    [initialSessions, showStopped],
  );

  const stoppedCount = initialSessions.filter(
    (session) => session.status === "cancelled",
  ).length;

  const selectedId =
    (requestedSelectedId &&
    visibleSessions.some((session) => session.id === requestedSelectedId)
      ? requestedSelectedId
      : null) ??
    visibleSessions.find((session) => session.id === initialSelectedId)?.id ??
    visibleSessions[0]?.id ??
    null;
  const messages =
    loadedMessages?.sessionId === selectedId ? loadedMessages.items : [];

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/sessions/${selectedId}/messages`);
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error ?? "Failed to load messages");
        setLoadedMessages({ sessionId: selectedId, items: [] });
        return;
      }
      setLoadedMessages({ sessionId: selectedId, items: data.messages ?? [] });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function postNote(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !note.trim()) return;
    setError(null);
    const res = await fetch(`/api/sessions/${selectedId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "note", text: note.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to post note");
      return;
    }
    setNote("");
    setLoadedMessages((current) => ({
      sessionId: selectedId,
      items:
        current?.sessionId === selectedId
          ? [...current.items, data.message]
          : [data.message],
    }));
  }

  const selected = initialSessions.find((s) => s.id === selectedId) ?? null;
  const visibleMessages = collapseActivityMessages(messages);
  const share = selected ? sharePrompt(selected) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(14rem,18rem)_1fr]">
      <section>
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          Tasks
        </h2>
        {stoppedCount > 0 ? (
          <label className="mt-2 flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={showStopped}
              onChange={(e) => setShowStopped(e.target.checked)}
            />
            Show stopped ({stoppedCount})
          </label>
        ) : null}
        {visibleSessions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No tasks yet. When your agent starts coordinating, its work shows
            up here.
          </p>
        ) : (
          <ul className="mt-3 space-y-1">
            {visibleSessions.map((session) => {
              const active = session.id === selectedId;
              return (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => setRequestedSelectedId(session.id)}
                    className={`w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm transition ${
                      active
                        ? "bg-matcha-deep text-[#f7faf6]"
                        : "text-ink hover:bg-[rgba(111,154,124,0.12)]"
                    }`}
                  >
                    <span className="block font-medium">
                      {sessionTitle(session)}
                    </span>
                    <span
                      className={`block text-xs ${active ? "text-[#dce8df]" : "text-muted"}`}
                    >
                      {sessionPeerLabel(session)} ·{" "}
                      {sessionStatusForHuman(session)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
            {selected ? sessionTitle(selected) : "Updates"}
          </h2>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showRaw}
              onChange={(e) => setShowRaw(e.target.checked)}
            />
            Show technical details
          </label>
        </div>

        {!selected ? (
          <p className="mt-3 text-sm text-muted">
            Select a task to see what happened.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              {sessionStatusForHuman(selected)}
            </p>

            {share ? (
              <div className="mt-4 rounded-md border border-line bg-[rgba(255,252,246,0.75)] px-4 py-3">
                <p className="text-sm font-medium text-ink">{share.headline}</p>
                <p className="mt-1 text-sm text-muted">{share.body}</p>
                {share.inviteUrl ? (
                  <ShareLinkRow label="Invite link" url={share.inviteUrl} />
                ) : null}
                {share.guestUrl ? (
                  <ShareLinkRow
                    label="Pick-a-time link (no account needed)"
                    url={share.guestUrl}
                  />
                ) : null}
              </div>
            ) : null}

            {error && (
              <p className="mt-3 text-sm font-medium text-danger" role="alert">
                {error}
              </p>
            )}

            <ol className="mt-4 space-y-3 border-t border-line pt-4">
              {pending && messages.length === 0 ? (
                <li className="text-sm text-muted">Loading…</li>
              ) : visibleMessages.length === 0 ? (
                <li className="text-sm text-muted">
                  Nothing has happened on this task yet.
                </li>
              ) : (
                visibleMessages.map((message) => (
                  <li key={message.id} className="text-sm">
                    <p className="font-medium text-ink">{message.plainEnglish}</p>
                    <p className="text-xs text-muted">
                      {new Date(message.createdAt).toLocaleString()}
                      {showRaw ? ` · ${message.kind}` : ""}
                    </p>
                    {showRaw && (
                      <pre className="mt-2 overflow-x-auto rounded bg-code-bg p-2 text-xs text-matcha-deep">
                        {JSON.stringify(message.body, null, 2)}
                      </pre>
                    )}
                  </li>
                ))
              )}
            </ol>

            <form onSubmit={postNote} className="mt-6 flex flex-wrap items-end gap-3">
              <label className="grid min-w-[16rem] flex-1 gap-1 text-sm">
                <span className="font-medium text-ink">Add a human note</span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="rounded-md border border-line bg-white/80 px-3 py-2 outline-none focus:border-matcha"
                  placeholder="Visible on this task"
                />
              </label>
              <button
                type="submit"
                disabled={pending || !note.trim()}
                className="cursor-pointer rounded-md border border-matcha-deep bg-matcha-deep px-4 py-2 text-sm font-semibold text-[#f7faf6] disabled:opacity-60"
              >
                Post
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

function ShareLinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <code className="break-all text-xs text-ink">{url}</code>
        <button
          type="button"
          className="cursor-pointer rounded-md border border-line bg-white/90 px-2 py-1 text-xs font-medium text-matcha-deep"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
