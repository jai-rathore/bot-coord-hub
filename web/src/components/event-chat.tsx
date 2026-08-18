"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (available === null) void load();
        }}
        className="text-sm font-semibold text-matcha-deep underline underline-offset-4 hover:text-matcha"
      >
        {isOrganizer
          ? `Ask ${agentName} about this event`
          : "None of these work, or it's complicated?"}
      </button>
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
            Automated assistant. It can only help with this event.
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
          answer above — that&apos;s what actually counts.
        </p>
      )}

      {available && (
        <>
          <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <li className="rounded-[0.8rem] bg-matcha/8 p-3 text-sm text-ink">
                {isOrganizer
                  ? `Hi — ask me who hasn't replied, what's leading, or to add another time.`
                  : `Hi — I'm ${agentName}, helping ${organizerName} organize this. Tell me what would work and I'll add it. I can only help with this event.`}
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
                ? "That's the end of this conversation — your answers above are saved."
                : `${turnsLeft} message${turnsLeft === 1 ? "" : "s"} left in this conversation.`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
