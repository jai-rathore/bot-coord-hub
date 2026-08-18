/** Plain-English strings for events. Mirrors the tone of activity-copy.ts. */

export function relativeDeadline(deadlineAt: Date, now = new Date()): string {
  const ms = deadlineAt.getTime() - now.getTime();
  if (ms <= 0) return "closed";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `closes in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `closes in ${hours}h`;
  return `closes in ${Math.round(hours / 24)}d`;
}

export function formatSlot(
  startsAt: Date | null,
  endsAt: Date | null,
  timezone: string,
): string {
  if (!startsAt) return "";
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  };
  let label: string;
  try {
    label = new Intl.DateTimeFormat("en-US", opts).format(startsAt);
  } catch {
    label = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(
      startsAt,
    );
  }
  if (!endsAt) return label;
  let end: string;
  try {
    end = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(endsAt);
  } catch {
    end = "";
  }
  return end ? `${label}–${end}` : label;
}

/** The paste-ready status line the organizer drops back into the group chat. */
export function statusSummary(opts: {
  status: string;
  responded: number | null;
  joined: number | null;
  leadingLabel: string | null;
  deadlineAt: Date;
  quorumRequired: number | null;
  quorumMet: boolean;
  countsHidden: boolean;
  now?: Date;
}): string {
  const now = opts.now ?? new Date();

  if (opts.status === "cancelled") return "This event was cancelled.";
  if (opts.status === "confirmed") {
    return opts.leadingLabel
      ? `Confirmed: ${opts.leadingLabel}.`
      : "Confirmed.";
  }
  if (opts.status === "locked") {
    return opts.leadingLabel
      ? `Locked in: ${opts.leadingLabel} — waiting on the organizer to confirm.`
      : "Locked — waiting on the organizer to confirm.";
  }
  if (opts.status === "expired") {
    return opts.quorumRequired && !opts.quorumMet
      ? `Closed without enough people — ${opts.quorumRequired} were needed.`
      : "Closed without an answer.";
  }

  const parts: string[] = [];
  if (!opts.countsHidden && opts.responded != null && opts.joined != null) {
    parts.push(`${opts.responded} of ${opts.joined} responded`);
  } else if (!opts.countsHidden && opts.responded != null) {
    parts.push(`${opts.responded} responded`);
  } else {
    parts.push("Responses are private");
  }
  if (!opts.countsHidden && opts.leadingLabel) {
    parts.push(`${opts.leadingLabel} leading`);
  }
  parts.push(relativeDeadline(opts.deadlineAt, now));
  return `${parts.join(" · ")}.`;
}
