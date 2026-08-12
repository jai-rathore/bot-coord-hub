import Link from "next/link";
import { Show, SignInButton } from "@clerk/nextjs";
import { SiteHeader } from "@/components/site-header";
import { InviteAcceptForm } from "@/components/invite-accept-form";
import { getPendingInviteByCode } from "@/lib/links";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const inviteCode = decodeURIComponent(code);

  let invite: Awaited<ReturnType<typeof getPendingInviteByCode>> | null = null;
  let loadError: string | null = null;
  try {
    invite = await getPendingInviteByCode(inviteCode);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Database unavailable";
  }

  let currentUser: Awaited<ReturnType<typeof ensureCurrentUser>> = null;
  try {
    currentUser = await ensureCurrentUser();
  } catch {
    // signed-out visitors are fine
  }

  return (
    <div className="flex min-h-full flex-col bg-[linear-gradient(180deg,#f8fbf7_0%,#f4f7f3_40%,#f0ebe0_100%)]">
      <SiteHeader />
      <main className="mx-auto w-[min(36rem,calc(100%-2rem))] flex-1 py-10">
        <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
          Accept invite
        </h1>
        <p className="mt-2 text-muted">
          Share this link with a friend’s bot/human — accepting creates a mutual
          HoneyMatcha link.
        </p>

        {loadError ? (
          <p className="mt-6 text-sm text-danger" role="alert">
            {loadError}
          </p>
        ) : !invite ? (
          <p className="mt-6 text-sm text-muted">
            This invite is missing, already accepted, or revoked.{" "}
            <Link href="/app/links">Go to Links</Link>
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-md border border-line bg-[rgba(255,252,246,0.65)] px-4 py-3 text-sm">
              <p className="font-medium text-ink">
                From {invite.inviter.name || invite.inviter.email}
              </p>
              <p className="mt-1 text-muted">
                Scopes: {(invite.link.scopes ?? []).join(", ") || "default"}
              </p>
              <p className="mt-1 font-mono text-xs text-muted">{inviteCode}</p>
            </div>

            <Show when="signed-out">
              <p className="text-sm text-muted">
                Sign in to accept this invite and form a mutual link.
              </p>
              <SignInButton mode="redirect">
                <button
                  type="button"
                  className="cursor-pointer rounded-md border border-matcha-deep bg-matcha-deep px-4 py-2 text-sm font-semibold text-[#f7faf6]"
                >
                  Sign in to accept
                </button>
              </SignInButton>
              <p className="text-xs text-muted">
                After signing in, return to this invite URL to accept.
              </p>
            </Show>

            <Show when="signed-in">
              {currentUser && currentUser.id === invite.inviter.id ? (
                <p className="text-sm text-muted">
                  This is your own invite. Share it with a friend’s bot/human
                  instead.{" "}
                  <Link href="/app/links">Back to Links</Link>
                </p>
              ) : (
                <InviteAcceptForm inviteCode={inviteCode} />
              )}
            </Show>
          </div>
        )}
      </main>
    </div>
  );
}
