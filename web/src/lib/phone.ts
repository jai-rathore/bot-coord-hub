/**
 * Phone numbers and notification-channel helpers.
 *
 * Numbers are stored as E.164. The UI accepts everyday US input
 * like (555) 123-4567 and normalizes it on save.
 */

export type NotifyChannel = "email" | "sms" | "both";

const E164 = /^\+[1-9]\d{7,14}$/;

export function isNotifyChannel(value: unknown): value is NotifyChannel {
  return value === "email" || value === "sms" || value === "both";
}

/** Loose parse for stored values. Unknown input becomes email. */
export function parseNotifyChannel(value: unknown): NotifyChannel {
  if (value === "sms" || value === "text") return "sms";
  if (value === "both") return "both";
  return "email";
}

export function wantsEmail(channel: NotifyChannel): boolean {
  return channel === "email" || channel === "both";
}

export function wantsSms(channel: NotifyChannel): boolean {
  return channel === "sms" || channel === "both";
}

/**
 * Channels a person should actually be queued for right now.
 * SMS is omitted until we have a number — they still get email when
 * the preference includes it.
 */
export function humanChannelsFor(input: {
  channel: NotifyChannel;
  phoneE164: string | null | undefined;
}): Array<"email" | "sms"> {
  const channels: Array<"email" | "sms"> = [];
  if (wantsEmail(input.channel)) channels.push("email");
  if (wantsSms(input.channel) && input.phoneE164) channels.push("sms");
  return channels;
}

export function normalizePhoneE164(
  input: string,
  defaultCountry: "US" | "intl" = "US",
): string | null {
  const raw = input.trim();
  if (!raw) return null;

  if (raw.startsWith("+")) {
    const compact = `+${raw.slice(1).replace(/\D/g, "")}`;
    return E164.test(compact) ? compact : null;
  }

  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (defaultCountry === "US") {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }

  if (digits.length >= 8 && digits.length <= 15) {
    const compact = `+${digits}`;
    return E164.test(compact) ? compact : null;
  }
  return null;
}

/** Friendly US formatting for inputs; other countries stay E.164. */
export function formatPhoneForInput(e164: string | null | undefined): string {
  if (!e164) return "";
  const match = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (match) return `(${match[1]}) ${match[2]}-${match[3]}`;
  return e164;
}

export function followCopy(
  channel: NotifyChannel,
  following: boolean,
): { title: string; detail: string } {
  if (following) {
    if (channel === "sms") {
      return {
        title: "You're getting updates",
        detail: "We'll text you when someone answers or suggests a time.",
      };
    }
    if (channel === "both") {
      return {
        title: "You're getting updates",
        detail:
          "We'll email and text you when someone answers or suggests a time.",
      };
    }
    return {
      title: "You're getting updates",
      detail: "We'll email you when someone answers or suggests a time.",
    };
  }
  if (channel === "sms") {
    return {
      title: "Follow this event",
      detail: "Get a text when someone answers or suggests a time.",
    };
  }
  if (channel === "both") {
    return {
      title: "Follow this event",
      detail: "Get an email and a text when someone answers or suggests a time.",
    };
  }
  return {
    title: "Follow this event",
    detail: "Get an email when someone answers or suggests a time.",
  };
}
