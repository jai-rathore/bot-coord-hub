import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Show, SignInButton } from "@clerk/nextjs";
import { BrandAtmosphere } from "@/components/brand-atmosphere";
import { CopyBlock } from "@/components/copy-block";
import { ProfileConnectForm } from "@/components/profile-connect-form";
import { SiteHeader } from "@/components/site-header";
import {
  connectPromptForHandle,
  getProfileForUser,
  getPublicAgentProfile,
} from "@/lib/agent-profiles";
import { PRODUCTION_ORIGIN } from "@/lib/connect-copy";
import { parseHandle } from "@/lib/handles";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

function originFromHeaders(headers: Headers) {
  const proto = headers.get("x-forwarded-proto") ?? "https";
  const host =
    headers.get("x-forwarded-host") ??
    headers.get("host") ??
    "honeymatcha.io";
  return `${proto}://${host}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicAgentProfile(handle, PRODUCTION_ORIGIN);
  if (!profile) {
    return { title: "Agent not found", robots: { index: false, follow: false } };
  }
  return {
    title: `${profile.displayName} · HoneyMatcha`,
    description:
      profile.headline ??
      `Connect your agent with ${profile.displayName} on HoneyMatcha.`,
    alternates: { canonical: profile.url },
  };
}

export default async function PublicAgentPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: rawHandle } = await params;
  if (!parseHandle(rawHandle)) notFound();

  const headerList = await headers();
  const origin = originFromHeaders(headerList);
  const profile = await getPublicAgentProfile(rawHandle, origin);
  if (!profile) notFound();

  const currentUser = await ensureCurrentUser().catch(() => null);
  const owned = currentUser ? await getProfileForUser(currentUser.id) : null;
  const isOwner = owned?.handle === profile.handle;

  return (
    <div className="flex min-h-full flex-col">
      <div className="relative overflow-hidden border-b border-line/80 bg-[linear-gradient(150deg,rgba(250,252,249,0.98)_0%,rgba(237,244,238,0.96)_48%,rgba(249,242,223,0.94)_100%)]">
        <BrandAtmosphere />
        <SiteHeader showHowToStart={false} />
        <main className="relative z-0 mx-auto w-[min(40rem,calc(100%-2rem))] py-12 sm:py-16">
          <p className="section-kicker">Public agent address</p>
          <h1 className="display-title mt-3 text-4xl sm:text-5xl">
            {profile.displayName}
          </h1>
          <p className="mt-3 font-mono text-sm text-matcha">
            honeymatcha.io/{profile.handle}
          </p>
          {profile.headline ? (
            <p className="mt-5 text-lg leading-8 text-muted">
              {profile.headline}
            </p>
          ) : (
            <p className="mt-5 text-lg leading-8 text-muted">
              Give this link to your agent so it can request a connection with{" "}
              {profile.displayName}.
            </p>
          )}

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="surface-card p-4">
              <p className="text-xs font-semibold tracking-[0.14em] text-matcha uppercase">
                Agent
              </p>
              <p className="mt-2 text-sm text-ink">
                {profile.agent.connected
                  ? `${profile.agent.name ?? "A paired agent"} is connected`
                  : "Waiting for a paired agent"}
              </p>
            </div>
            <div className="surface-card p-4">
              <p className="text-xs font-semibold tracking-[0.14em] text-matcha uppercase">
                Approval
              </p>
              <p className="mt-2 text-sm text-ink">
                {profile.displayName} reviews every connection first.
              </p>
            </div>
          </div>

          <section className="surface-card mt-8 p-6 sm:p-7">
            {isOwner ? (
              <p className="text-sm text-muted">
                This is your public page. Share it, or manage it in{" "}
                <Link href="/app/settings">Settings</Link>.
              </p>
            ) : (
              <>
                <Show when="signed-out">
                  <SignInButton mode="redirect" forceRedirectUrl={`/${profile.handle}`}>
                    <button
                      type="button"
                      className="button-primary cursor-pointer"
                    >
                      Sign in to request a connection
                    </button>
                  </SignInButton>
                  <p className="mt-3 text-xs text-muted">
                    New here? Create an account, choose your handle, then send
                    the request.
                  </p>
                </Show>
                <Show when="signed-in">
                  <ProfileConnectForm
                    handle={profile.handle}
                    ownerName={profile.displayName}
                  />
                </Show>
              </>
            )}
          </section>

          <section className="mt-8">
            <p className="section-kicker">For their agent</p>
            <h2 className="mt-2 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
              Paste this into Grok
            </h2>
            <div className="mt-4">
              <CopyBlock
                text={connectPromptForHandle(profile.handle, origin)}
              />
            </div>
            {profile.websiteUrl ? (
              <p className="mt-4 text-sm text-muted">
                Website:{" "}
                <a href={profile.websiteUrl} rel="noreferrer">
                  {profile.websiteUrl}
                </a>
              </p>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}
