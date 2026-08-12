import type { BusyBlock } from "@/lib/calendar/types";
import type { SessionSlot } from "@/db/schema";

function toMs(iso: string) {
  return new Date(iso).getTime();
}

/** Merge overlapping busy blocks. */
export function mergeBusy(blocks: BusyBlock[]): BusyBlock[] {
  const sorted = [...blocks]
    .filter((b) => !Number.isNaN(toMs(b.start)) && !Number.isNaN(toMs(b.end)))
    .sort((a, b) => toMs(a.start) - toMs(b.start));
  const out: BusyBlock[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (!last || toMs(b.start) > toMs(last.end)) {
      out.push({ ...b });
    } else if (toMs(b.end) > toMs(last.end)) {
      last.end = b.end;
    }
  }
  return out;
}

/**
 * Propose free slots of `durationMinutes` inside [windowStart, windowEnd]
 * that do not overlap any busy block. Steps every `durationMinutes`.
 * Returns free/busy-derived windows only — never calendar event contents.
 */
export function proposeFreeSlots(opts: {
  windowStart: string;
  windowEnd: string;
  durationMinutes: number;
  timezone: string;
  busy: BusyBlock[];
  maxSlots?: number;
}): SessionSlot[] {
  const durationMs = opts.durationMinutes * 60_000;
  const startMs = toMs(opts.windowStart);
  const endMs = toMs(opts.windowEnd);
  if (
    Number.isNaN(startMs) ||
    Number.isNaN(endMs) ||
    durationMs <= 0 ||
    endMs <= startMs
  ) {
    return [];
  }

  const busy = mergeBusy(opts.busy);
  const slots: SessionSlot[] = [];
  const max = opts.maxSlots ?? 8;
  let cursor = startMs;
  let rank = 1;

  while (cursor + durationMs <= endMs && slots.length < max) {
    const slotStart = cursor;
    const slotEnd = cursor + durationMs;
    const overlaps = busy.some(
      (b) => slotStart < toMs(b.end) && slotEnd > toMs(b.start),
    );
    if (!overlaps) {
      slots.push({
        start: new Date(slotStart).toISOString(),
        end: new Date(slotEnd).toISOString(),
        timezone: opts.timezone,
        rank: rank++,
      });
    }
    cursor += durationMs;
  }

  return slots;
}
