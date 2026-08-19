"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ShareQr } from "@/components/share-qr";

/**
 * The owner's own code, for holding up in front of someone.
 *
 * One tap from their page to a full-screen, forced-light panel: a QR on a dark
 * background is unreadable to most camera apps, and the page itself may be
 * tinted. The overlay is deliberately almost empty — at the moment it is used,
 * two people are looking at a phone between them, and anything else on screen
 * is something to read instead of scan.
 *
 * It renders through a portal on purpose. `.surface-card` sets a
 * `backdrop-filter`, which makes the card — not the viewport — the containing
 * block for `position: fixed` descendants, so an overlay rendered in place was
 * pinned inside the card and left the rest of the page showing around it.
 */
export function MeetCode({
  handle,
  displayName,
  origin,
  label = "Show my code",
  className = "button-primary w-full cursor-pointer sm:w-auto",
}: {
  handle: string;
  displayName: string;
  origin: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // The scanned URL differs from the page URL by one flag, which is what tells
  // the landing page to lead with "you just met" instead of the profile.
  const meetUrl = `${origin.replace(/\/$/, "")}/${handle}?meet=1`;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(meetUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    // Native share beats a copied link on a phone, which is where this is used.
    if (typeof navigator.share !== "function") {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: `${displayName} on HoneyMatcha`,
        text: "Let's find a time.",
        url: meetUrl,
      });
    } catch {
      // A dismissed share sheet is not an error.
    }
  }

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Your HoneyMatcha code"
      /* Opaque, forced-light, and above everything: the camera pointed at this
         screen must see a white field and nothing else. */
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 overflow-y-auto bg-white p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Close"
        className="absolute top-4 right-4 grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-[#d9e2da] bg-white text-[#173f2e]"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>

      <div className="text-center">
        <p className="text-xs font-semibold tracking-[0.14em] text-[#2f694a] uppercase">
          Scan to find a time
        </p>
        <p className="mt-2 font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-[#173f2e]">
          {displayName}
        </p>
      </div>

      <ShareQr
        url={meetUrl}
        alt={`QR code to meet ${displayName} on HoneyMatcha`}
        size={320}
        showDownload={false}
        className="max-w-[min(20rem,78vw)]"
      />

      <p className="font-mono text-sm text-[#2f694a]">
        honeymatcha.io/{handle}
      </p>

      <div className="flex w-full max-w-sm flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={share}
          className="min-h-11 flex-1 cursor-pointer rounded-full border border-[#d9e2da] px-4 py-2 text-sm font-semibold text-[#173f2e]"
        >
          Send instead
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="min-h-11 flex-1 cursor-pointer rounded-full border border-[#d9e2da] px-4 py-2 text-sm font-semibold text-[#173f2e]"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="min-h-11 w-full max-w-sm cursor-pointer rounded-full bg-[#173f2e] px-5 py-2 text-sm font-semibold text-white"
      >
        Done
      </button>
    </div>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 4h5v5H4zM15 4h5v5h-5zM4 15h5v5H4zM15 15h2v2h-2zM19 19h1M13 11h3v3M11 4v3M11 11v3M11 18v2M18 13h2" />
        </svg>
        {label}
      </button>

      {/* `open` can only be true after a click, so this never runs during SSR
          or the first hydration pass and needs no mounted flag. */}
      {open ? createPortal(overlay, document.body) : null}
    </>
  );
}
