import type { AllowedHours, SessionSlot } from "@/db/schema";

function parseHm(hm: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

/** Format hour/minute in a timezone using Intl. */
function localParts(iso: string, timeZone: string) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return { hour: hour === 24 ? 0 : hour, minute, day: dayMap[weekday] ?? 1 };
}

export function slotWithinAllowedHours(
  slot: SessionSlot,
  allowedHours: AllowedHours | null | undefined,
  timezone: string,
): boolean {
  if (!allowedHours?.start || !allowedHours?.end) return true;
  const startHm = parseHm(allowedHours.start);
  const endHm = parseHm(allowedHours.end);
  if (!startHm || !endHm) return true;

  const start = localParts(slot.start, timezone);
  const end = localParts(slot.end, timezone);

  if (allowedHours.days?.length && !allowedHours.days.includes(start.day)) {
    return false;
  }

  const startMin = start.hour * 60 + start.minute;
  const endMin = end.hour * 60 + end.minute;
  const windowStart = startHm.h * 60 + startHm.m;
  const windowEnd = endHm.h * 60 + endHm.m;

  return startMin >= windowStart && endMin <= windowEnd;
}

/**
 * Auto-book when confirm_required is false AND the accepted slot fits
 * allowed hours (if configured). Otherwise require human confirms.
 */
export function shouldAutoBook(opts: {
  confirmRequired: boolean;
  allowedHours?: AllowedHours | null;
  timezone: string;
  slot: SessionSlot;
}): boolean {
  if (opts.confirmRequired) return false;
  return slotWithinAllowedHours(
    opts.slot,
    opts.allowedHours,
    opts.timezone,
  );
}

export function mergeLinkPolicies(
  links: Array<{
    confirmRequired: boolean;
    allowedHours: AllowedHours | null;
    timezone: string | null;
  }>,
): {
  confirmRequired: boolean;
  allowedHours: AllowedHours | null;
  timezone: string | null;
} {
  // Most restrictive: any link requiring confirm → confirm required.
  const confirmRequired = links.some((l) => l.confirmRequired);
  const withHours = links.find((l) => l.allowedHours);
  const withTz = links.find((l) => l.timezone);
  return {
    confirmRequired,
    allowedHours: withHours?.allowedHours ?? null,
    timezone: withTz?.timezone ?? null,
  };
}
