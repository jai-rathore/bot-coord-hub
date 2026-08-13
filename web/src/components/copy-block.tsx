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
    <div className="relative">
      <pre className="overflow-x-auto rounded-md border border-line bg-[rgba(255,252,246,0.75)] p-4 pr-24 text-[0.82rem] leading-relaxed text-ink whitespace-pre-wrap">
        {text}
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        className="absolute right-2 top-2 cursor-pointer rounded-md border border-line bg-white/90 px-2.5 py-1 text-xs font-medium text-matcha-deep"
      >
        {copied ? "Copied" : label}
      </button>
    </div>
  );
}
