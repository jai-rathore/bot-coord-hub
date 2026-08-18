"use client";

import { useEffect, useState } from "react";
import { ShareQr } from "@/components/share-qr";

/**
 * The owner's own code, for holding up in front of someone.
 *
 * One tap from their page to a full-screen, forced-light panel: a QR on a dark
 * background is unreadable to most camera apps, and the page itself may be
 * tinted. The overlay is deliberately almost empty — at the moment it is used,
 * two people are looking at a phone between them, and anything else on screen
 * is something to read instead of scan.
 */
export function MeetCode({
  handle,
  displayName,
  origin,
}: {
  handle: string;
  displayName: string;
  origin: string;
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="button-primary cursor-pointer"
      >
        Show my code
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Your HoneyMatcha code"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6"
        >
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
          />

          <p className="font-mono text-sm text-[#2f694a]">
            honeymatcha.io/{handle}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={share}
              className="rounded-full border border-[#d9e2da] px-4 py-2 text-sm font-semibold text-[#173f2e]"
            >
              Send instead
            </button>
            <button
              type="button"
              onClick={copyLink}
              className="rounded-full border border-[#d9e2da] px-4 py-2 text-sm font-semibold text-[#173f2e]"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-[#173f2e] px-5 py-2 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
