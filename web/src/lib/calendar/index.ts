import { AgentApiError } from "@/lib/agent-errors";
import {
  getGoogleConnection,
  googleCalendarEnabled,
  googleOAuthConfigured,
} from "@/lib/google-oauth";
import { GoogleCalendarPort } from "./google";
import { MockCalendar } from "./mock";
import type { BusyBlock, CalendarPort } from "./types";

export const CALENDAR_REQUIRED_MESSAGE =
  "A connected calendar is required. HoneyMatcha never simulates production bookings.";

export const CALENDAR_REQUIRED_AGENT_INSTRUCTIONS =
  "Tell the human to Connect Calendar at /app/settings. Do not call create_session. Do not book a Google Calendar event yourself.";

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

export function mockCalendarAllowed(
  nodeEnv = process.env.NODE_ENV,
  override = process.env.ALLOW_MOCK_CALENDAR,
): boolean {
  return nodeEnv !== "production" || override === "true";
}

/**
 * Resolve CalendarPort for a user.
 * Google when connected. MockCalendar is allowed only outside production
 * unless an explicit test-only override is set.
 */
/**
 * Choose a calendar port from a connection that has already been read.
 * Separated from getCalendarPortForUser so callers holding the connection do
 * not cause a second lookup of the same row.
 */
function calendarPortFor(
  conn: Awaited<ReturnType<typeof getGoogleConnection>>,
): CalendarPort {
  if (googleCalendarEnabled() && googleOAuthConfigured() && conn?.refreshToken) {
    return new GoogleCalendarPort(conn);
  }
  if (!mockCalendarAllowed()) {
    throw new AgentApiError(409, CALENDAR_REQUIRED_MESSAGE, {
      code: "calendar_not_connected",
      agent_instructions: CALENDAR_REQUIRED_AGENT_INSTRUCTIONS,
    });
  }
  return new MockCalendar();
}

export async function getCalendarPortForUser(
  userId: string,
): Promise<CalendarPort> {
  const conn =
    googleCalendarEnabled() && googleOAuthConfigured()
      ? await getGoogleConnection(userId)
      : null;
  return calendarPortFor(conn);
}

export async function calendarConnectionStatus(
  userId: string,
): Promise<"google" | "mock" | "none"> {
  if (googleCalendarEnabled() && googleOAuthConfigured()) {
    const conn = await getGoogleConnection(userId);
    if (conn?.refreshToken) return "google";
  }
  if (mockCalendarAllowed()) return "mock";
  return "none";
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
  // Participants are independent, so their calendars are read concurrently.
  // Serially this was one or two Google round trips each, one after another,
  // on a path a human is waiting on.
  const perParticipant = await Promise.all(
    opts.userIds.map(async (userId) => {
      const email = opts.emailsByUserId[userId];
      if (!email) return null;
      // Read the connection once and hand it to the port, instead of
      // getCalendarPortForUser looking it up and this function looking the
      // same row up again. Skipped entirely when Google is off, matching what
      // getCalendarPortForUser does.
      const conn =
        googleCalendarEnabled() && googleOAuthConfigured()
          ? await getGoogleConnection(userId)
          : null;
      const port = calendarPortFor(conn);
      const calendarId =
        port.provider === "google" ? conn?.calendarId || "primary" : "primary";
      const result = await port.getFreeBusy({
        calendarIds: [calendarId],
        timeMin: opts.timeMin,
        timeMax: opts.timeMax,
      });
      const blocks = result.byCalendar[calendarId] ?? result.busy;
      return { email, blocks, provider: port.provider };
    }),
  );

  const busy: BusyBlock[] = [];
  const byCalendar: Record<string, BusyBlock[]> = {};
  let provider: "mock" | "google" = "mock";

  // Assembled in the original order so the flattened busy list is unchanged.
  for (const entry of perParticipant) {
    if (!entry) continue;
    if (entry.provider === "google") provider = "google";
    byCalendar[entry.email] = entry.blocks;
    busy.push(...entry.blocks);
  }

  return { provider, busy, byCalendar };
}
