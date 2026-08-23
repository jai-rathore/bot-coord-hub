import { ImageResponse } from "next/og";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import { findEventBySlug, loadBoardSource, projectBoard } from "@/lib/events/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1200;
const HEIGHT = 630;
const INK = "#173f2e";
const MATCHA = "#2f694a";
const LINE = "#d9e2da";

/**
 * The card someone sees when an event link is pasted into a chat.
 *
 * Without it every event fell back to the site-wide marketing image, so a lunch
 * invite previewed as a product ad: the one moment where the preview should be
 * doing the inviting.
 *
 * A plain route handler rather than a colocated `opengraph-image` file: that
 * convention re-resolves the page's metadata on the image request and hands it
 * params without the slug, which fails before the image is ever drawn. Here the
 * slug is just a route param and nothing else runs.
 *
 * The summary comes from the *anonymous* projection: the same one a signed-out
 * visitor sees. Link previews are unfurled by servers nobody here controls, so
 * this must never disclose more than the public page; under blind or
 * counts_only that means no tallies.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let title = "An invitation";
  let summary = "Pick what works for you. HoneyMatcha handles the rest.";
  let organizer: string | null = null;

  if (eventsFeatureEnabled() && slug) {
    const event = await findEventBySlug(slug);
    const source = event ? await loadBoardSource(event.id) : null;
    if (source) {
      const board = projectBoard(source, null);
      title = board.event.title;
      summary = board.summary;
      organizer = board.event.organizerName;
    }
  }

  // Long titles shrink rather than overflow the card.
  const titleSize = title.length > 60 ? 60 : title.length > 34 ? 76 : 94;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: "#f4f7f3",
          backgroundImage:
            "linear-gradient(140deg, #f8fbf7 0%, #f0f5f0 48%, #f3ecdd 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              backgroundColor: INK,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#f3ecdd",
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            hm
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              letterSpacing: 4,
              color: MATCHA,
              fontWeight: 700,
            }}
          >
            {(organizer
              ? `${organizer} is organizing`
              : "HoneyMatcha"
            ).toUpperCase()}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div
            style={{
              display: "flex",
              fontSize: titleSize,
              lineHeight: 1.08,
              color: INK,
              fontWeight: 700,
            }}
          >
            {title}
          </div>
          <div
            style={{ display: "flex", fontSize: 34, color: MATCHA, lineHeight: 1.3 }}
          >
            {summary}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `2px solid ${LINE}`,
            paddingTop: 28,
            fontSize: 26,
            color: MATCHA,
          }}
        >
          <div style={{ display: "flex" }}>
            Tap the times that work. Nothing is booked without a yes.
          </div>
          <div style={{ display: "flex", fontWeight: 700, color: INK }}>
            honeymatcha.io
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      // Satori renders this from scratch on every request, and it is a
      // single-threaded instance: one link pasted into a busy group chat means
      // every platform that unfurls it triggers another render, slowing
      // unrelated requests. Event titles can change, so this is a short cache
      // with a long grace window rather than an immutable one.
      headers: {
        "Cache-Control":
          "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
      },
    },
  );
}
