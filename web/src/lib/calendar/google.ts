import { fetchWithTimeout } from "@/lib/fetch-timeout";
import type { CalendarConnection } from "@/db/schema";
import { getValidGoogleAccessToken } from "@/lib/google-oauth";
import type {
  BusyBlock,
  CalendarPort,
  CreateEventInput,
  CreateEventResult,
  FreeBusyQuery,
  FreeBusyResult,
} from "./types";

/**
 * Per-user Google Calendar port.
 * freeBusy only for availability; createEvent adds Google Meet conference.
 */
export class GoogleCalendarPort implements CalendarPort {
  readonly provider = "google" as const;

  constructor(private readonly connection: CalendarConnection) {}

  private async token(): Promise<string> {
    return getValidGoogleAccessToken(this.connection);
  }

  async getFreeBusy(query: FreeBusyQuery): Promise<FreeBusyResult> {
    const token = await this.token();
    const items = query.calendarIds.map((id) => ({ id }));
    const res = await fetchWithTimeout("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: query.timeMin,
        timeMax: query.timeMax,
        items,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google freeBusy failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as {
      calendars?: Record<string, { busy?: BusyBlock[] }>;
    };
    const byCalendar: Record<string, BusyBlock[]> = {};
    const busy: BusyBlock[] = [];
    for (const [id, cal] of Object.entries(data.calendars ?? {})) {
      const blocks = cal.busy ?? [];
      byCalendar[id] = blocks;
      busy.push(...blocks);
    }
    busy.sort((a, b) => a.start.localeCompare(b.start));
    return { provider: "google", busy, byCalendar };
  }

  async createEvent(input: CreateEventInput): Promise<CreateEventResult> {
    const token = await this.token();
    const calendarId = encodeURIComponent(
      this.connection.calendarId || "primary",
    );
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: input.title,
          description: input.notes,
          start: { dateTime: input.start, timeZone: input.timezone },
          end: { dateTime: input.end, timeZone: input.timezone },
          attendees: input.attendeeEmails.map((email) => ({ email })),
          conferenceData: {
            createRequest: {
              requestId: input.requestId,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google createEvent failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as {
      id?: string;
      htmlLink?: string;
      hangoutLink?: string;
      conferenceData?: {
        entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
      };
    };
    const meetEntry = data.conferenceData?.entryPoints?.find(
      (e) => e.entryPointType === "video",
    );
    return {
      provider: "google",
      eventId: data.id ?? `google_${Date.now()}`,
      htmlLink: data.htmlLink,
      meetLink: meetEntry?.uri ?? data.hangoutLink,
    };
  }
}
