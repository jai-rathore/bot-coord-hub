import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BrandLink } from "@/components/brand-link";
import { EventClient } from "@/components/event-client";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import { findEventBySlug, loadBoardSource, projectBoard } from "@/lib/events/board";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  if (!eventsFeatureEnabled()) return { title: "HoneyMatcha" };
  const { slug } = await params;
  // Metadata is resolved for the colocated opengraph-image route too, and there
  // the slug is not always present. Looking one up with `undefined` throws
  // inside the driver, which fails the image rather than the page.
  if (!slug) return { title: "Event · HoneyMatcha" };
  const event = await findEventBySlug(slug);
  if (!event) return { title: "Event · HoneyMatcha" };

  const title = `${event.title} · HoneyMatcha`;
  const description =
    event.description ??
    "Pick what works for you. HoneyMatcha handles the back-and-forth.";

  return {
    title,
    description,
    // A share link is unlisted, not secret. Previewing it in a chat is the
    // point; turning up in a search result is not — so the card is rich but
    // the page stays out of the index.
    robots: { index: false, follow: false },
    // Without these the invite inherits the site-wide marketing card, so a
    // lunch invite previews as a product ad. Relative paths resolve against
    // metadataBase, set in the root layout.
    openGraph: {
      title: event.title,
      description,
      type: "website",
      siteName: "HoneyMatcha",
      images: [
        {
          url: `/api/events/${slug}/og`,
          width: 1200,
          height: 630,
          alt: `${event.title} on HoneyMatcha`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description,
      images: [`/api/events/${slug}/og`],
    },
  };
}

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!eventsFeatureEnabled()) notFound();
  const { slug } = await params;

  const event = await findEventBySlug(slug);
  if (!event) notFound();

  const [source, user] = await Promise.all([
    loadBoardSource(event.id),
    ensureCurrentUser(),
  ]);
  if (!source) notFound();

  const board = projectBoard(source, user?.id ?? null);
  const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(`/e/${slug}`)}`;

  return (
    <main className="min-h-full bg-[linear-gradient(180deg,#f8fbf7_0%,#f4f7f3_42%,#f0ebe0_100%)] px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <BrandLink />
        <div className="mt-8">
          <EventClient
            initialBoard={board}
            signedIn={Boolean(user)}
            signInUrl={signInUrl}
          />
        </div>
        <p className="mt-8 text-center text-xs text-muted">
          Anyone with this link can see the event. Only signed-in people can
          respond, so every answer belongs to a real person.
        </p>
      </div>
    </main>
  );
}
