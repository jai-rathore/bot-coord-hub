"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type CalendarConnectionSummary = {
  connected: boolean;
  enabled: boolean;
  configured: boolean;
  googleAccountEmail: string | null;
  calendarId: string | null;
  updatedAt: string | null;
};

export function ConnectCalendar({
  initial,
}: {
  initial: CalendarConnectionSummary;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function disconnect() {
    setError(null);
    // The await runs inside the transition so `pending` covers the request,
    // not just what follows it.
    startTransition(async () => {
      try {
        const res = await fetch("/api/google/disconnect", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Failed to disconnect");
          return;
        }
        router.refresh();
      } catch {
        setError("Failed to disconnect");
      }
    });
  }

  if (!initial.enabled) {
    return (
      <p className="mt-4 text-sm text-muted">
        Calendar connections are not available in this environment yet.
      </p>
    );
  }

  if (!initial.configured) {
    return (
      <p className="mt-4 text-sm text-muted">
        Google Calendar is temporarily unavailable. HoneyMatcha will never
        pretend that a meeting was booked.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {initial.connected ? (
        <>
          <p className="text-sm text-ink">
            Connected as{" "}
            <span className="font-medium">
              {initial.googleAccountEmail ?? "Google account"}
            </span>
            {initial.calendarId ? (
              <span className="text-muted"> · calendar {initial.calendarId}</span>
            ) : null}
          </p>
          <p className="text-sm text-muted">
            Free/busy is shared with linked peers during scheduling. Event
            titles from your calendar are never exposed. Bookings create a
            Google Calendar event with Meet.
          </p>
          <button
            type="button"
            onClick={disconnect}
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-danger/35 bg-white/60 px-3.5 py-2 text-sm font-semibold text-danger transition hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Disconnect
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            Connect Google Calendar so your Grok Bot can compare free/busy and
            create an event with Meet after everyone approves.
          </p>
          {/* OAuth start is an API route that 302s to Google, not a Next.js page. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route, not a page */}
          <a href="/api/google/start" className="button-primary mt-1">
            Connect Google Calendar
          </a>
        </>
      )}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
