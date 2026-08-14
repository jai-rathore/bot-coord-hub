import type { Metadata } from "next";
import Link from "next/link";
import { Show, SignInButton } from "@clerk/nextjs";
import { SiteHeader } from "@/components/site-header";
import { PublicInviteRedeemForm } from "@/components/public-invite-redeem-form";
import { getPublicInvitePreview } from "@/lib/public-invites";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect on HoneyMatcha",
  robots: { index: false, follow: false },
};

export default async function PublicInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: encodedToken } = await params;
  const token = decodeURIComponent(encodedToken);
  const invite = await getPublicInvitePreview(token);
  const currentUser = await ensureCurrentUser().catch(() => null);

  return (
    <div className="flex min-h-full flex-col bg-[linear-gradient(180deg,#f8fbf7_0%,#f4f7f3_40%,#f0ebe0_100%)]">
      <SiteHeader />
      <main className="mx-auto w-[min(38rem,calc(100%-2rem))] flex-1 py-10">
        {!invite ? (
          <div className="rounded-2xl border border-line bg-white/80 p-6">
            <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-matcha-deep">
              This invitation is unavailable
            </h1>
            <p className="mt-3 text-muted">
              It may be expired, revoked, full, or malformed.
            </p>
            <Link
              href="/"
              className="mt-5 inline-block text-sm font-semibold text-matcha-deep underline"
            >
              Learn about HoneyMatcha
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-white/80 p-6 shadow-[0_24px_70px_rgba(31,74,54,0.08)] sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-matcha">
              Public connection invitation
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-matcha-deep">
              Connect with {invite.ownerName}
            </h1>
            {invite.label ? (
              <p className="mt-3 font-medium text-ink">{invite.label}</p>
            ) : null}
            <p className="mt-3 text-muted">
              Send a connection request so your personal agents can coordinate
              plans through HoneyMatcha.
            </p>
            <div className="mt-5 rounded-xl border border-line bg-[rgba(111,154,124,0.06)] p-4 text-sm text-muted">
              <p>
                Scanning this code does not grant access automatically.
                {` ${invite.ownerName}`} must approve your request first.
              </p>
              <p className="mt-2">
                This link expires {new Date(invite.expiresAt).toLocaleString()}.
              </p>
            </div>

            {currentUser?.id === invite.ownerUserId ? (
              <p className="mt-6 text-sm text-muted">
                This is your public invitation. Share it with someone else.
              </p>
            ) : (
              <>
                <Show when="signed-out">
                  <SignInButton mode="redirect">
                    <button
                      type="button"
                      className="mt-6 cursor-pointer rounded-md bg-matcha-deep px-4 py-2.5 text-sm font-semibold text-white"
                    >
                      Sign in to request connection
                    </button>
                  </SignInButton>
                  <p className="mt-3 text-xs text-muted">
                    New here? The sign-in flow also lets you create an account.
                  </p>
                </Show>
                <Show when="signed-in">
                  <div className="mt-6">
                    <PublicInviteRedeemForm token={token} />
                  </div>
                </Show>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
