"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * A scannable code for any HoneyMatcha share URL.
 *
 * Rendered in the browser rather than served from an endpoint: the URL is
 * already in the page, so a round trip would only add latency to something a
 * person is holding up in front of someone else.
 *
 * Error correction is "M" at 240px and "Q" once large — a phone screen held at
 * arm's length in a dim bar is the design case, and the extra redundancy
 * survives glare and a fingerprint better than a denser, cleaner code does.
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
  // Keyed by url so a changed url shows the spinner again rather than the
  // previous code, without a synchronous reset inside the effect.
  const [render, setRender] = useState<{
    url: string;
    dataUrl: string | null;
    error: boolean;
  }>({ url: "", dataUrl: null, error: false });

  useEffect(() => {
    let active = true;
    // Imported here rather than at module scope. The QR panel sits behind a
    // toggle, but a static import pulled the encoder into the initial bundle of
    // every page that can reach it — People and the event page among them.
    void (async () => {
      try {
        const { default: QRCode } = await import("qrcode");
        const value = await QRCode.toDataURL(url, {
          // Render at 2x so the same code stays crisp when a layout scales it up.
          width: size * 2,
          margin: 2,
          errorCorrectionLevel: size >= 320 ? "Q" : "M",
          color: { dark: "#1f4a36", light: "#ffffff" },
        });
        if (active) setRender({ url, dataUrl: value, error: false });
      } catch {
        if (active) setRender({ url, dataUrl: null, error: true });
      }
    })();
    return () => {
      active = false;
    };
  }, [url, size]);

  const current = render.url === url ? render : null;
  const dataUrl = current?.dataUrl ?? null;
  const error = current?.error ?? false;

  if (error) {
    return (
      <p className="text-xs text-danger" role="alert">
        QR generation failed. The link still works.
      </p>
    );
  }
  if (!dataUrl) {
    return (
      <div
        className={`animate-pulse rounded-lg bg-white/70 ${className ?? ""}`}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  return (
    <div className="space-y-2">
      <Image
        src={dataUrl}
        alt={alt}
        width={size}
        height={size}
        unoptimized
        priority
        className={`rounded-lg border border-line bg-white p-1 ${className ?? ""}`}
        style={{ width: size, height: size }}
      />
      {showDownload ? (
        <a
          href={dataUrl}
          download={downloadName}
          className="inline-block text-xs font-semibold text-matcha-deep underline"
        >
          Download QR code
        </a>
      ) : null}
    </div>
  );
}
