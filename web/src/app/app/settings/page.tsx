import { ConnectCalendar } from "@/components/connect-calendar";
import Link from "next/link";
import { headers } from "next/headers";
import { PageHeading } from "@/components/page-heading";
import { NotificationSettingsForm } from "@/components/notification-settings-form";
import { ProfileSettingsForm } from "@/components/profile-settings-form";
import {
  connectPromptForHandle,
  getOwnedProfile,
} from "@/lib/agent-profiles";
import {
  getGoogleConnection,
  googleCalendarEnabled,
  googleOAuthConfigured,
} from "@/lib/google-oauth";
import { smsOffered } from "@/lib/sms-flag";
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
  const headerList = await headers();
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const host =
    headerList.get("x-forwarded-host") ??
    headerList.get("host") ??
    "honeymatcha.io";
  const origin = `${proto}://${host}`;
  const [conn, profile] = await Promise.all([
    getGoogleConnection(user.id),
    getOwnedProfile(user, origin),
  ]);

  return (
    <div>
      <PageHeading
        eyebrow="Preferences"
        title="Settings"
        description="Your calendar, how we reach you, and your public page."
      />

      {params.calendar === "connected" ? (
        <p
          className="mt-6 rounded-xl border border-matcha-soft/30 bg-matcha-soft/10 px-4 py-3 text-sm text-matcha"
          role="status"
        >
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

      <section className="surface-card mt-9 p-5 sm:p-7">
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          Notifications
        </h2>
        {smsOffered() ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            How should we reach you when an event you follow changes? Your Grok
            Bot still gets every update in its inbox. This is just for you.
          </p>
        ) : null}
        <div className={smsOffered() ? "mt-5" : "mt-2"}>
          <NotificationSettingsForm
            initialChannel={user.notifyChannel}
            initialPhone={user.phoneE164}
            smsEnabled={smsOffered()}
          />
        </div>
      </section>

      {profile ? (
        <section className="surface-card mt-9 p-5 sm:p-7">
          <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
            Public agent page
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Share this link on your website. People give it to their agents so
            they can request a connection with yours.
          </p>
          <div className="mt-5">
            <ProfileSettingsForm
              profile={profile}
              connectPrompt={connectPromptForHandle(profile.handle, origin)}
            />
          </div>
        </section>
      ) : null}

      <section className="surface-card mt-9 p-5 sm:p-7">
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
      <section className="mt-10 border-t border-line pt-8">
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          More
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Link
            href="/app/people"
            className="surface-card surface-card-interactive p-5 no-underline"
          >
            <span className="font-semibold text-matcha-deep">Add people</span>
            <span className="mt-1 block text-sm leading-6 text-muted">
              Invite the people you coordinate with, or send a private guest
              request to someone without an account.
            </span>
          </Link>
          {/* The single door to the agent layer, matching Home. Nobody has to
              walk through it to use the rest of HoneyMatcha. */}
          <Link
            href="/app/agent"
            className="surface-card surface-card-interactive p-5 no-underline"
          >
            <span className="font-semibold text-matcha-deep">
              Advanced agent setup
            </span>
            <span className="mt-1 block text-sm leading-6 text-muted">
              Connect an AI agent, see what it has done, and control what it is
              allowed to ask for.
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}
