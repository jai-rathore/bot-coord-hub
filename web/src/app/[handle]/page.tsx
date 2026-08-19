import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Show, SignInButton } from "@clerk/nextjs";
import { BrandAtmosphere } from "@/components/brand-atmosphere";
import { CopyBlock } from "@/components/copy-block";
import { MeetCard } from "@/components/meet-card";
import { MeetCode } from "@/components/meet-code";
import { ProfileConnectForm } from "@/components/profile-connect-form";
import { SiteHeader } from "@/components/site-header";
import {
  connectPromptForHandle,
  getProfileForUser,
  getPublicAgentProfile,
} from "@/lib/agent-profiles";
import { PRODUCTION_ORIGIN } from "@/lib/connect-copy";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import { parseHandle } from "@/lib/handles";
import { isMeetChoice, type MeetChoice } from "@/lib/meet-shapes";
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

/**
 * A person's public page — the thing behind a scanned QR code.
 *
 * It has two audiences that were previously interleaved: a human standing in
 * front of the person whose code they just scanned, and an agent being handed a
 * connection prompt. Mixing them meant the human read machine instructions at
 * the exact moment they were deciding whether to bother. Now the page always
 * leads with the human action and keeps the agent path folded away under its
 * own clearly marked heading, in the dark "agent mode" treatment used
 * everywhere else in the product.
 */
export default async function PublicAgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  // `?meet=1` is what the scanned code carries: same page, but it opens on the
  // thing the person actually came here to do rather than on a bio.
  const query = await searchParams;
  const scanned = query.meet === "1" && !isOwner;
  const carriedIntent: MeetChoice | null = isMeetChoice(query.intent)
    ? query.intent
    : null;
  const meetEnabled = eventsFeatureEnabled();

  return (
    <div className="flex min-h-full flex-col">
      <div className="relative overflow-hidden border-b border-line/80 bg-[linear-gradient(150deg,rgba(250,252,249,0.98)_0%,rgba(237,244,238,0.96)_48%,rgba(249,242,223,0.94)_100%)]">
        <BrandAtmosphere />
        <SiteHeader />
        <main className="relative z-0 mx-auto w-[min(40rem,calc(100%-2rem))] py-10 sm:py-14">
          <p className="section-kicker">
            {isOwner
              ? "Your public page"
              : scanned
                ? "Nice to meet you"
                : "Public page"}
          </p>
          <h1 className="display-title mt-3 text-4xl sm:text-5xl">
            {profile.displayName}
          </h1>
          <p className="mt-3 font-mono text-sm text-matcha">
            honeymatcha.io/{profile.handle}
          </p>
          {profile.headline ? (
            <p className="mt-4 text-lg leading-8 text-muted">
              {profile.headline}
            </p>
          ) : null}

          {/* ── The human lane ───────────────────────────────────────────── */}
          {isOwner ? (
            <section className="lane-you mt-8 rounded-2xl p-6 sm:p-7">
              <span className="lane-tag">Your hands</span>
              <h2 className="mt-3 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
                Let them scan you
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                One code, always the same. They point a camera at it, pick
                coffee, lunch, drinks, or a call — and you both get times to
                choose from.
              </p>
              {meetEnabled ? (
                <div className="mt-5">
                  <MeetCode
                    handle={profile.handle}
                    displayName={profile.displayName}
                    origin={origin}
                  />
                </div>
              ) : null}
              <p className="mt-4 text-xs text-muted">
                Manage this page in <Link href="/app/settings">Settings</Link>.
              </p>
            </section>
          ) : scanned && meetEnabled ? (
            <div className="mt-8">
              <MeetCard
                handle={profile.handle}
                displayName={profile.displayName}
                signedIn={Boolean(currentUser)}
                initialIntent={carriedIntent}
              />
            </div>
          ) : (
            <section className="lane-you mt-8 rounded-2xl p-6 sm:p-7">
              <span className="lane-tag">Your hands</span>
              <h2 className="mt-3 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
                Ask to connect
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {profile.displayName} reviews every request before anything is
                shared.
              </p>
              <div className="mt-5">
                <Show when="signed-out">
                  <SignInButton
                    mode="redirect"
                    forceRedirectUrl={`/${profile.handle}`}
                  >
                    <button
                      type="button"
                      className="button-primary w-full cursor-pointer sm:w-auto"
                    >
                      Sign in to request
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
              </div>
            </section>
          )}

          {/* ── The agent lane, folded away ──────────────────────────────── */}
          <details className="lane-agent group mt-4 rounded-2xl p-6 sm:p-7">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span>
                <span className="lane-tag">Agent mode</span>
                <span className="mt-3 block font-[family-name:var(--font-fraunces)] text-xl font-semibold text-[#f4f8f4]">
                  {isOwner ? "Hand this to an agent" : "Or let the agents do it"}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="shrink-0 text-honey-soft transition group-open:rotate-180"
              >
                &darr;
              </span>
            </summary>
            <p className="mt-4 text-sm leading-6 text-[#cfe0d3]">
              {isOwner
                ? "Anyone can give this prompt to their AI agent. It requests a connection with yours, and you still approve it."
                : `Paste this into your agent. It asks ${profile.displayName} for a connection — nothing happens until both sides approve.`}
            </p>
            <div className="mt-4">
              <CopyBlock text={connectPromptForHandle(profile.handle, origin)} />
            </div>
            <p className="mt-4 text-sm text-[#cfe0d3]">
              {profile.agent.connected
                ? `${profile.agent.name ?? "A paired agent"} is connected on this side.`
                : "No agent is paired on this side yet."}
            </p>
          </details>

          {profile.websiteUrl ? (
            <p className="mt-6 text-sm text-muted">
              Website:{" "}
              <a href={profile.websiteUrl} rel="noreferrer">
                {profile.websiteUrl}
              </a>
            </p>
          ) : null}
        </main>
      </div>
    </div>
  );
}
