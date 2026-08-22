"use client";

import { useState } from "react";

export function CopyBlock({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="group relative min-w-0">
      <pre className="max-w-full min-w-0 overflow-x-auto rounded-xl border border-line bg-white/72 p-4 text-[0.78rem] leading-relaxed text-ink whitespace-pre-wrap shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] sm:pr-24">
        {text}
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        aria-live="polite"
        className="mt-2 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-white/95 px-2.5 py-1.5 text-[0.7rem] font-semibold text-matcha-deep shadow-sm transition hover:border-matcha-soft sm:absolute sm:top-2 sm:right-2 sm:mt-0 sm:w-auto"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          {copied ? (
            <path d="m5 12 4 4L19 6" />
          ) : (
            <>
              <rect x="8" y="8" width="11" height="11" rx="2" />
              <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
            </>
          )}
        </svg>
        {copied ? "Copied" : label}
      </button>
    </div>
  );
}
