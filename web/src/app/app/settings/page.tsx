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
        Connections and preferences your agent uses when coordinating for you.
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
          Your agent
        </h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Agents connect through a short-lived code in your browser. They never
          need your HoneyMatcha password.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/agents" className="font-semibold">
            Connection instructions
          </Link>
          <Link href="/app/keys">Advanced connection settings</Link>
        </div>
      </section>
    </div>
  );
}
