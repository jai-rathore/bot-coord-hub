"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NotificationChannelPicker } from "@/components/notification-channel-picker";
import {
  formatPhoneForInput,
  parseNotifyChannel,
  wantsSms,
  type NotifyChannel,
} from "@/lib/phone";

export function NotificationSettingsForm({
  initialChannel,
  initialPhone,
  smsEnabled,
}: {
  initialChannel: string;
  initialPhone: string | null;
  smsEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<NotifyChannel>(
    parseNotifyChannel(initialChannel),
  );
  const [phone, setPhone] = useState(formatPhoneForInput(initialPhone));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const needsPhone = wantsSms(channel);

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    // The await runs inside the transition so `pending` covers the
    // request, not just what follows it.
    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            phone: needsPhone ? phone.trim() : phone.trim() || null,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? "Could not save notification preferences");
          return;
        }
        if (typeof data.phone === "string") {
          setPhone(formatPhoneForInput(data.phone));
        }
        setSaved(true);
        router.refresh();
      } catch {
        setError("Could not save notification preferences");
      }
    });
  }

  if (!smsEnabled) {
    return (
      <p id="notifications" className="text-sm leading-6 text-muted">
        We&apos;ll email you when a plan you follow changes. Your agent
        still gets every update in its inbox.
      </p>
    );
  }

  return (
    <form id="notifications" onSubmit={save} className="space-y-5">
      <NotificationChannelPicker
        value={channel}
        onChange={(next) => {
          setChannel(next);
          setSaved(false);
        }}
        disabled={pending}
      />
      {needsPhone ? (
        <label className="grid gap-2 text-sm">
          <span className="font-medium text-ink">Mobile number</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setSaved(false);
            }}
            placeholder="(555) 123-4567"
            className="field"
          />
          <span className="text-xs text-muted">
            Used only for HoneyMatcha event texts. US numbers can be typed
            the usual way.
          </span>
        </label>
      ) : phone.trim() ? (
        <p className="text-xs text-muted">
          Your number stays on the profile in case you want texts later.
        </p>
      ) : null}
      {error ? (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="text-sm font-medium text-matcha" role="status">
          Notification preferences saved.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="button-primary cursor-pointer disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save notifications"}
      </button>
    </form>
  );
}
