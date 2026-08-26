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
 * The garden is a real QR matrix. Dark tiles and blossom-dark modules stay
 * scanner-black, light tiles stay cream, and the three finder patterns are
 * left geometrically exact. High error correction covers the tree in the
 * center. Tap to flatten the garden into a high-contrast code for a dim bar
 * or a fussy camera.
 */
export function ShareQr({
  url,
  alt,
  downloadName = "honeymatcha-qr.png",
  size = 240,
  showDownload = true,
  className,
}: {
  url: string;
  alt: string;
  downloadName?: string;
  size?: number;
  showDownload?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mountRef = useRef<SakuraQrMount | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
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
        setDownloadUrl(handle.capturePng("scan"));
        setReady(true);
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
          setDownloadUrl(handle.capturePng("scan"));
          setReady(true);
        } catch {
          if (active) setError(true);
        }
      }
    })();

    return () => {
      active = false;
      mountRef.current?.dispose();
      mountRef.current = null;
    };
  }, [url, size]);

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
        onClick={() => setReveal((open) => !open)}
        aria-pressed={reveal}
        aria-label={`${alt}. ${reveal ? "Showing high-contrast code. Tap to return to the sakura garden." : "Sakura garden code. Tap to show a high-contrast code."}`}
        className="block w-full cursor-pointer rounded-2xl border border-line bg-[#f6f1e7] p-0 text-left shadow-[0_18px_40px_rgba(23,63,46,0.12)]"
      >
        <span className="relative block aspect-square overflow-hidden rounded-2xl">
          {!ready ? (
            <span
              className="absolute inset-0 animate-pulse bg-[linear-gradient(160deg,#f6f1e7,#eadfcd_55%,#f3c1cc33)]"
              aria-hidden
            />
          ) : null}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-manipulation"
            style={{ opacity: ready ? 1 : 0 }}
          />
        </span>
      </button>
      <p className="text-[0.7rem] font-medium tracking-[0.04em] text-matcha">
        {reveal ? "Tap to return to the tree" : "Tap the tree to see the code"}
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
