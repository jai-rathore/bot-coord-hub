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

  async function disconnect() {
    setError(null);
    const res = await fetch("/api/google/disconnect", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to disconnect");
      return;
    }
    startTransition(() => router.refresh());
  }

  if (!initial.enabled) {
    return (
      <p className="mt-4 text-sm text-muted">
        Google Calendar is disabled. Set{" "}
        <code>GOOGLE_CALENDAR_ENABLED=true</code> and OAuth client credentials
        to enable Connect Calendar.
      </p>
    );
  }

  if (!initial.configured) {
    return (
      <p className="mt-4 text-sm text-muted">
        Missing <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code>
        . MockCalendar remains active for schedule_meeting.
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
            className="rounded-md border border-danger/40 px-3 py-1.5 text-sm text-danger hover:bg-danger/5"
          >
            Disconnect
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            Connect Google Calendar so schedule_meeting can read free/busy and
            create events with Meet when confirms are approved.
          </p>
          <a
            href="/api/google/start"
            className="inline-flex rounded-md bg-matcha px-3 py-1.5 text-sm text-white hover:bg-matcha-deep"
          >
            Connect Google Calendar
          </a>
        </>
      )}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
