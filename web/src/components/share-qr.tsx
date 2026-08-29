"use client";

import { useEffect, useRef, useState } from "react";
import { webglAvailable, type SakuraQrMount } from "@/lib/sakura-qr";

/**
 * A scannable sakura garden for any HoneyMatcha share URL.
 *
 * Rendered in the browser rather than served from an endpoint: the URL is
 * already in the page, so a round trip would only add latency to something a
 * person is holding up in front of someone else.
 *
 * The garden is a real QR matrix, grown the way tree.icqr.com does it: dark
 * modules near the centre stack into trunk, the mid-ring becomes canopy, and
 * the outer ring is grass. Finder patterns stay geometrically exact. High
 * error correction covers the tree. Tap to flatten the garden into a
 * high-contrast code for a dim bar or a fussy camera.
 */
export function ShareQr({
  url,
  alt,
  downloadName = "honeymatcha-qr.png",
  size = 240,
  showDownload = true,
  autoReveal = false,
  className,
}: {
  url: string;
  alt: string;
  downloadName?: string;
  size?: number;
  showDownload?: boolean;
  autoReveal?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mountRef = useRef<SakuraQrMount | null>(null);
  const interactedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    let autoRevealTimer = 0;
    interactedRef.current = false;
    setReady(false);
    setError(false);
    setReveal(false);
    setDownloadUrl(null);

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    void (async () => {
      try {
        const useScene = webglAvailable();
        const mount = useScene
          ? (await import("@/lib/sakura-qr-scene")).mountSakuraQrScene
          : (await import("@/lib/sakura-qr-canvas")).mountSakuraQrCanvas;
        const handle = await mount(canvas, {
          url,
          reveal: false,
          reducedMotion,
          compact: size < 230,
        });
        if (!active) {
          handle.dispose();
          return;
        }
        mountRef.current = handle;
        try {
          const png = handle.capturePng("scan");
          if (png) setDownloadUrl(png);
        } catch {
          setDownloadUrl(null);
        }
        setReady(true);
        if (autoReveal) {
          autoRevealTimer = window.setTimeout(
            () => {
              if (active && !interactedRef.current) setReveal(true);
            },
            reducedMotion ? 0 : 1_650,
          );
        }
      } catch {
        if (!active) return;
        try {
          const { mountSakuraQrCanvas } = await import("@/lib/sakura-qr-canvas");
          const handle = await mountSakuraQrCanvas(canvas, {
            url,
            reveal: false,
            reducedMotion,
            compact: size < 230,
          });
          if (!active) {
            handle.dispose();
            return;
          }
          mountRef.current = handle;
          try {
            const png = handle.capturePng("scan");
            if (png) setDownloadUrl(png);
          } catch {
            setDownloadUrl(null);
          }
          setReady(true);
          if (autoReveal) {
            autoRevealTimer = window.setTimeout(
              () => {
                if (active && !interactedRef.current) setReveal(true);
              },
              reducedMotion ? 0 : 1_650,
            );
          }
        } catch {
          if (active) setError(true);
        }
      }
    })();

    return () => {
      active = false;
      window.clearTimeout(autoRevealTimer);
      mountRef.current?.dispose();
      mountRef.current = null;
    };
  }, [url, size, autoReveal]);

  useEffect(() => {
    mountRef.current?.setReveal(reveal);
  }, [reveal]);

  if (error) {
    return (
      <p className="text-xs text-danger" role="alert">
        QR generation failed. The link still works.
      </p>
    );
  }

  return (
    <div
      className={`space-y-2 ${className ?? ""}`}
      style={{ width: size, maxWidth: "100%" }}
    >
      <button
        type="button"
        onClick={() => {
          interactedRef.current = true;
          setReveal((open) => !open);
        }}
        aria-pressed={reveal}
        aria-label={`${alt}. ${reveal ? "Showing high-contrast code. Tap to return to the sakura garden." : "Sakura garden code. Tap to show a high-contrast code."}`}
        className="block w-full cursor-pointer rounded-[1.6rem] bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-matcha focus-visible:ring-offset-4"
      >
        <span className="relative block aspect-[3/4] overflow-hidden rounded-[1.6rem] border border-white/70 bg-[#f8eee9] shadow-[0_24px_70px_rgba(74,44,26,0.12)]">
          {!ready ? (
            <span
              className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_50%_60%,#f3c1cc33,transparent_62%)]"
              aria-hidden
            />
          ) : null}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-manipulation"
            style={{ opacity: ready ? 1 : 0, imageRendering: "auto" }}
          />
        </span>
      </button>
      <p
        className="flex items-center gap-2 text-[0.7rem] font-semibold tracking-[0.04em] text-matcha"
        aria-live="polite"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${reveal ? "bg-matcha" : "bg-[#e8899e]"}`}
          aria-hidden
        />
        {reveal
          ? "Scanner-ready · Tap to return to the garden"
          : autoReveal
            ? "The garden will settle into a scanner-ready code"
            : "Garden view · Tap for the scanner-ready code"}
      </p>
      {showDownload && downloadUrl ? (
        <a
          href={downloadUrl}
          download={downloadName}
          className="inline-block text-xs font-semibold text-matcha-deep underline"
        >
          Download QR code
        </a>
      ) : null}
    </div>
  );
}
