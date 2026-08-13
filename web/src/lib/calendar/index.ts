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
export async function getCalendarPortForUser(
  userId: string,
): Promise<CalendarPort> {
  if (googleCalendarEnabled() && googleOAuthConfigured()) {
    const conn = await getGoogleConnection(userId);
    if (conn?.refreshToken) {
      return new GoogleCalendarPort(conn);
    }
  }
  if (!mockCalendarAllowed()) {
    throw new AgentApiError(409, CALENDAR_REQUIRED_MESSAGE, {
      code: "calendar_not_connected",
      agent_instructions: CALENDAR_REQUIRED_AGENT_INSTRUCTIONS,
    });
  }
  return new MockCalendar();
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
