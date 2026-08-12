"use client";

import { useEffect, useState, useTransition } from "react";
import type { PublicMessage, PublicSession } from "@/lib/sessions";

export function ActivityBoard({
  initialSessions,
}: {
  initialSessions: PublicSession[];
}) {
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSessions[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/sessions/${selectedId}/messages`);
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error ?? "Failed to load messages");
        setMessages([]);
        return;
      }
      setMessages(data.messages ?? []);
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
    setMessages((prev) => [...prev, data.message]);
  }

  const selected = initialSessions.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(14rem,18rem)_1fr]">
      <section>
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          Sessions
        </h2>
        {initialSessions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No sessions yet. When agents open a coordination session, it shows
            up here.
          </p>
        ) : (
          <ul className="mt-3 space-y-1">
            {initialSessions.map((session) => {
              const active = session.id === selectedId;
              return (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(session.id)}
                    className={`w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm transition ${
                      active
                        ? "bg-matcha-deep text-[#f7faf6]"
                        : "text-ink hover:bg-[rgba(111,154,124,0.12)]"
                    }`}
                  >
                    <span className="block font-medium">
                      {session.intentType}
                    </span>
                    <span
                      className={`block text-xs ${active ? "text-[#dce8df]" : "text-muted"}`}
                    >
                      {session.peer?.name || session.peer?.email || "No peer"} ·{" "}
                      {session.status}
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
            {selected ? selected.intentType : "Messages"}
          </h2>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showRaw}
              onChange={(e) => setShowRaw(e.target.checked)}
            />
            Show raw JSON
          </label>
        </div>

        {!selected ? (
          <p className="mt-3 text-sm text-muted">Select a session to read its board.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              Status <span className="text-ink">{selected.status}</span>
              {selected.peer
                ? ` · Peer ${selected.peer.name || selected.peer.email}`
                : ""}
            </p>

            {error && (
              <p className="mt-3 text-sm font-medium text-danger" role="alert">
                {error}
              </p>
            )}

            <ol className="mt-4 space-y-3 border-t border-line pt-4">
              {pending && messages.length === 0 ? (
                <li className="text-sm text-muted">Loading…</li>
              ) : messages.length === 0 ? (
                <li className="text-sm text-muted">No messages on this board yet.</li>
              ) : (
                messages.map((message) => (
                  <li key={message.id} className="text-sm">
                    <p className="font-medium text-ink">{message.plainEnglish}</p>
                    <p className="text-xs text-muted">
                      {message.kind} ·{" "}
                      {new Date(message.createdAt).toLocaleString()}
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
                  placeholder="Visible on the session board"
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
