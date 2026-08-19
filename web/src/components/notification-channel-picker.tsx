"use client";

import type { NotifyChannel } from "@/lib/phone";

const CHANNELS: Array<{ id: NotifyChannel; label: string }> = [
  { id: "email", label: "Email" },
  { id: "sms", label: "Text" },
  { id: "both", label: "Both" },
];

export function NotificationChannelPicker({
  value,
  onChange,
  disabled = false,
  size = "default",
}: {
  value: NotifyChannel;
  onChange: (channel: NotifyChannel) => void;
  disabled?: boolean;
  size?: "default" | "compact";
}) {
  const compact = size === "compact";
  return (
    <div
      role="radiogroup"
      aria-label="How we should reach you"
      className="flex flex-wrap gap-2"
    >
      {CHANNELS.map((channel) => {
        const selected = value === channel.id;
        return (
          <button
            key={channel.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(channel.id)}
            className={
              selected
                ? `${compact ? "min-h-9 px-3 text-xs" : "min-h-11 px-3.5 text-sm"} inline-flex items-center justify-center rounded-[0.7rem] border border-transparent bg-matcha font-semibold text-[#f7faf6] shadow-[0_6px_16px_rgba(47,105,74,0.25)] disabled:opacity-60`
                : `${compact ? "min-h-9 px-3 text-xs" : "min-h-11 px-3.5 text-sm"} inline-flex items-center justify-center rounded-[0.7rem] border border-line bg-white/70 font-semibold text-matcha-deep transition hover:border-matcha-soft disabled:opacity-60`
            }
          >
            {channel.label}
          </button>
        );
      })}
    </div>
  );
}
