import {
  getGoogleConnection,
  googleCalendarEnabled,
  googleOAuthConfigured,
} from "@/lib/google-oauth";
import { GoogleCalendarPort } from "./google";
import { MockCalendar } from "./mock";
import type { BusyBlock, CalendarPort } from "./types";

export type {
  BusyBlock,
  CalendarPort,
  CreateEventInput,
  CreateEventResult,
  FreeBusyQuery,
  FreeBusyResult,
} from "./types";
export { MockCalendar } from "./mock";
export { GoogleCalendarPort } from "./google";

/**
 * Resolve CalendarPort for a user.
 * Google when connected. MockCalendar is allowed only outside production
 * unless an explicit test-only override is set.
 */
export async function getCalendarPortForUser(
  userId: string,
): Promise<CalendarPort> {
  if (googleCalendarEnabled() && googleOAuthConfigured()) {
    const conn = await getGoogleConnection(userId);
    if (conn?.refreshToken) {
      return new GoogleCalendarPort(conn);
    }
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_MOCK_CALENDAR !== "true"
  ) {
    throw Object.assign(
      new Error(
        "A connected calendar is required. HoneyMatcha never simulates production bookings.",
      ),
      { status: 409, code: "calendar_not_connected" },
    );
  }
  return new MockCalendar();
}

/** Aggregate free/busy across participants (each user's connection or mock). */
export async function collectFreeBusyForUsers(opts: {
  userIds: string[];
  emailsByUserId: Record<string, string>;
  timeMin: string;
  timeMax: string;
}): Promise<{
  provider: "mock" | "google";
  busy: BusyBlock[];
  byCalendar: Record<string, BusyBlock[]>;
}> {
  const busy: BusyBlock[] = [];
  const byCalendar: Record<string, BusyBlock[]> = {};
  let provider: "mock" | "google" = "mock";

  for (const userId of opts.userIds) {
    const email = opts.emailsByUserId[userId];
    if (!email) continue;
    const port = await getCalendarPortForUser(userId);
    if (port.provider === "google") provider = "google";
    const conn =
      port.provider === "google" ? await getGoogleConnection(userId) : null;
    const calendarId = conn?.calendarId || "primary";
    const result = await port.getFreeBusy({
      calendarIds: [calendarId],
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
    });
    const blocks = result.byCalendar[calendarId] ?? result.busy;
    byCalendar[email] = blocks;
    busy.push(...blocks);
  }

  return { provider, busy, byCalendar };
}
