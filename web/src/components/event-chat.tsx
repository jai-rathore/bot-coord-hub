"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SageAvatar } from "@/components/sage-avatar";
import type { EventBoard } from "@/lib/events/types";

type ChatMessage = { id: string; role: string; text: string; createdAt: string };

export function EventChat({
  slug,
  agentName,
  organizerName,
  isOrganizer,
  onBoard,
}: {
  slug: string;
  agentName: string;
  organizerName: string;
  isOrganizer: boolean;
  onBoard: (board: EventBoard) => void;
}) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${slug}/chat`);
      const data = await res.json().catch(() => ({}));
      setAvailable(Boolean(data.available));
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      setAvailable(false);
    }
  }, [slug]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, open]);

  async function send(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;

    setBusy(true);
    setError(null);
    setDraft("");
    const optimistic: ChatMessage = {
      id: `local-${messages.length}`,
      role: isOrganizer ? "organizer" : "participant",
      text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/events/${slug}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "The assistant could not respond.");
        setBusy(false);
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `agent-${prev.length}`,
          role: "agent",
          text: data.reply,
          createdAt: new Date().toISOString(),
        },
      ]);
      // Mirror any change straight back into the grid above.
      if (data.board) onBoard(data.board as EventBoard);
      setTurnsLeft(
        typeof data.turnsRemaining === "number" ? data.turnsRemaining : null,
      );
    } catch {
      setError("Could not reach HoneyMatcha. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    // A first-time recipient has no idea what "Sage" is. The collapsed state
    // introduces it as a thing: name, what it is, what it can do: instead of
    // a bare link that assumes they already know.
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[0.9rem] border border-matcha-soft/40 bg-matcha/6 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <SageAvatar className="mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              {agentName}
              <span className="ml-2 rounded-full bg-matcha/12 px-2 py-0.5 text-[0.65rem] font-bold tracking-[0.08em] text-matcha uppercase">
                Your agent
              </span>
            </p>
            <p className="mt-1 text-sm text-muted">
              {isOrganizer
                ? `Ask who hasn't answered, what's leading, or tell it a time to add.`
                : `None of these times work, or it's complicated? Tell ${agentName}: it can record your answer, suggest another time, or pass a question to ${organizerName}.`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            if (available === null) void load();
          }}
          className="button-secondary shrink-0"
        >
          Chat with {agentName}
        </button>
      </div>
    );
  }

  return (
    <section className="surface-card mt-4 p-5 sm:p-6" aria-label="Assistant">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">
            {agentName}
            {!isOrganizer && (
              <span className="font-normal text-muted">
                {" "}
                · organizing for {organizerName}
              </span>
            )}
          </p>
          <p className="text-xs text-muted">
            Automated assistant: not a person. It can record your answers,
            suggest times, and pass questions along. Only for this event.
          </p>
        </div>
        <button
          type="button"
          className="text-sm font-semibold text-muted hover:text-ink"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>

      {available === false && (
        <p className="mt-4 text-sm text-muted">
          The assistant isn&apos;t available right now. You can still tap your
          answer above: that&apos;s what actually counts.
        </p>
      )}

      {available && (
        <>
          <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <li className="rounded-[0.8rem] bg-matcha/8 p-3 text-sm text-ink">
                {isOrganizer
                  ? `Hi: ask me who hasn't replied, what's leading, or to add another time.`
                  : `Hi, I'm ${agentName}, the assistant organizing this for ${organizerName}. Tell me which times work, name a different one and I'll suggest it, or ask a question and I'll pass it on.`}
              </li>
            )}
            {messages.map((message) => (
              <li
                key={message.id}
                className={
                  message.role === "agent"
                    ? "rounded-[0.8rem] bg-matcha/8 p-3 text-sm text-ink"
                    : message.role === "system"
                      ? "text-xs text-muted italic"
                      : "rounded-[0.8rem] border border-line bg-white/70 p-3 text-sm text-ink"
                }
              >
                {message.role === "system" ? "Message blocked." : message.text}
              </li>
            ))}
            <div ref={endRef} />
          </ul>

          {error && (
            <p className="mt-3 text-sm font-medium text-danger" role="alert">
              {error}
            </p>
          )}

          <form onSubmit={send} className="mt-4 flex gap-2">
            <label htmlFor="chat-input" className="sr-only">
              Message {agentName}
            </label>
            <input
              id="chat-input"
              value={draft}
              maxLength={1000}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                isOrganizer ? "Who hasn't replied?" : "I can only do after 7pm…"
              }
              className="field flex-1"
              disabled={busy}
            />
            <button type="submit" className="button-primary" disabled={busy}>
              {busy ? "…" : "Send"}
            </button>
          </form>

          {turnsLeft != null && turnsLeft <= 3 && (
            <p className="mt-2 text-xs text-muted">
              {turnsLeft === 0
                ? "That's the end of this conversation: your answers above are saved."
                : `${turnsLeft} message${turnsLeft === 1 ? "" : "s"} left in this conversation.`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
