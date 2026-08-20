import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CopyBlock } from "@/components/copy-block";
import { MeetCode } from "@/components/meet-code";
import { PageHeading } from "@/components/page-heading";
import { ShareQr } from "@/components/share-qr";
import { getProfileForUser } from "@/lib/agent-profiles";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

async function originFromHeaders() {
  const list = await headers();
  const proto = list.get("x-forwarded-proto") ?? "https";
  const host =
    list.get("x-forwarded-host") ?? list.get("host") ?? "honeymatcha.io";
  return `${proto}://${host}`;
}

/**
 * Your code, without leaving the app.
 *
 * "My code" in the nav used to go straight to `/{handle}` — the public page,
 * which runs the marketing shell. Tapping a tab therefore threw you out of the
 * app: the tab bar vanished, and the only way back was a "Home" button that
 * appeared beside your own avatar. A tab that exits the tab bar is a dead end,
 * so the tab lands here and the public page is one deliberate link away.
 */
export default async function MyCodePage() {
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }
  const profile = await getProfileForUser(user.id);
  if (!profile) redirect("/setup");

  const origin = await originFromHeaders();
  const publicUrl = `${origin.replace(/\/$/, "")}/${profile.handle}`;
  const meetUrl = `${publicUrl}?meet=1`;
  const displayName = profile.displayName ?? user.name ?? profile.handle;

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Your code"
        title="Let them scan you"
        description="One code, always the same. Someone points a camera at it, picks coffee, lunch, drinks, or a call — and you both get times to choose from."
      />

      <section className="surface-card p-5 sm:p-7">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <ShareQr
            url={meetUrl}
            alt={`QR code for ${displayName}`}
            downloadName={`honeymatcha-${profile.handle}.png`}
            size={200}
          />
          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <p className="text-sm font-semibold text-ink">Your link</p>
              <p className="mt-1 font-mono text-sm break-all text-matcha">
                honeymatcha.io/{profile.handle}
              </p>
            </div>
            <CopyBlock text={publicUrl} label="Copy link" />
            {/* Full-screen and forced-light, for the moment two people are
                actually holding a phone between them. */}
            <MeetCode
              handle={profile.handle}
              displayName={displayName}
              origin={origin}
              label="Show full screen"
              className="button-primary w-full cursor-pointer sm:w-auto"
            />
          </div>
        </div>
      </section>

      <section className="border-t border-line pt-6">
        <p className="text-sm leading-6 text-muted">
          This is how it looks to them:{" "}
          <Link
            href={`/${profile.handle}`}
            className="font-semibold text-matcha-deep"
          >
            see your public page
          </Link>
          . Change your name, headline, or whether it is listed at all in{" "}
          <Link href="/app/settings" className="font-semibold text-matcha-deep">
            Settings
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
