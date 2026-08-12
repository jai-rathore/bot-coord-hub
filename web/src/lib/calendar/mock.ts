import { randomBytes } from "crypto";
import type {
  BusyBlock,
  CalendarPort,
  CreateEventInput,
  CreateEventResult,
  FreeBusyQuery,
  FreeBusyResult,
} from "./types";

/**
 * Deterministic-ish mock free/busy that still exercises the full state machine.
 * Marks lunch (12:00–13:00) busy in the local window for each calendar day.
 */
export class MockCalendar implements CalendarPort {
  readonly provider = "mock" as const;

  async getFreeBusy(query: FreeBusyQuery): Promise<FreeBusyResult> {
    const busy: BusyBlock[] = [];
    const start = new Date(query.timeMin);
    const end = new Date(query.timeMax);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { provider: "mock", busy: [], byCalendar: {} };
    }

    const cursor = new Date(start);
    cursor.setUTCHours(0, 0, 0, 0);
    while (cursor < end) {
      const lunchStart = new Date(cursor);
      lunchStart.setUTCHours(12, 0, 0, 0);
      const lunchEnd = new Date(cursor);
      lunchEnd.setUTCHours(13, 0, 0, 0);
      if (lunchEnd > start && lunchStart < end) {
        busy.push({
          start: lunchStart.toISOString(),
          end: lunchEnd.toISOString(),
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const byCalendar: Record<string, BusyBlock[]> = {};
    for (const id of query.calendarIds) {
      byCalendar[id] = busy;
    }

    return { provider: "mock", busy, byCalendar };
  }

  async createEvent(input: CreateEventInput): Promise<CreateEventResult> {
    const eventId = `mock_evt_${randomBytes(8).toString("hex")}`;
    return {
      provider: "mock",
      eventId,
      htmlLink: `https://calendar.example/mock/${eventId}?title=${encodeURIComponent(input.title)}`,
      meetLink: `https://meet.example/mock/${eventId}`,
    };
  }
}
