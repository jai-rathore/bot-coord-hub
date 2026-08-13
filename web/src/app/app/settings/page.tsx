import { ConnectCalendar } from "@/components/connect-calendar";
import Link from "next/link";
import {
  getGoogleConnection,
  googleCalendarEnabled,
  googleOAuthConfigured,
} from "@/lib/google-oauth";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string; message?: string }>;
}) {
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }

  const params = await searchParams;
  const conn = await getGoogleConnection(user.id);

  return (
    <div>
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
        Settings
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Connect Google Calendar here so your agent can find a real time.
        Then ask your agent to connect to HoneyMatcha — this site is where
        you approve, not where you chat.
      </p>

      {params.calendar === "connected" ? (
        <p className="mt-4 text-sm text-matcha" role="status">
          Google Calendar connected.
        </p>
      ) : null}
      {params.calendar === "error" ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {params.message
            ? decodeURIComponent(params.message)
            : "Calendar connection failed."}
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          Google Calendar
        </h2>
        <ConnectCalendar
          initial={{
            connected: Boolean(conn),
            enabled: googleCalendarEnabled(),
            configured: googleOAuthConfigured(),
            googleAccountEmail: conn?.googleAccountEmail ?? null,
            calendarId: conn?.calendarId ?? null,
            updatedAt: conn?.updatedAt?.toISOString() ?? null,
          }}
        />
      </section>
      <section className="mt-10 border-t border-line pt-7">
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          {conn ? "Continue setup" : "Your coordination setup"}
        </h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Calendar is one part of the setup. Connect your agent and choose the
          people it can coordinate with next.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Link
            href="/agents"
            className="rounded-xl border border-line bg-white/70 p-4 no-underline transition hover:border-matcha-soft"
          >
            <span className="font-semibold text-matcha-deep">
              Connect your agent
            </span>
            <span className="mt-1 block text-sm leading-6 text-muted">
              Approve a short-lived code in your browser. Your agent never
              needs your password.
            </span>
          </Link>
          <Link
            href="/app/people"
            className="rounded-xl border border-line bg-white/70 p-4 no-underline transition hover:border-matcha-soft"
          >
            <span className="font-semibold text-matcha-deep">Add people</span>
            <span className="mt-1 block text-sm leading-6 text-muted">
              Invite known people your agent can coordinate with, or use a
              private guest request when they do not have an account.
            </span>
          </Link>
        </div>
        <Link href="/app/keys" className="mt-4 inline-flex text-xs text-muted">
          Advanced connection settings
        </Link>
      </section>
    </div>
  );
}
