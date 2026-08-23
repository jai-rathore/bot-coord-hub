export type BusyBlock = { start: string; end: string };

export type FreeBusyQuery = {
  /** Opaque calendar ids / emails: never event contents */
  calendarIds: string[];
  timeMin: string;
  timeMax: string;
};

export type FreeBusyResult = {
  provider: "mock" | "google";
  /** Merged busy blocks across calendars (ISO timestamps) */
  busy: BusyBlock[];
  byCalendar: Record<string, BusyBlock[]>;
};

export type CreateEventInput = {
  /** Stable per coordination task so provider retries are idempotent. */
  requestId: string;
  title: string;
  start: string;
  end: string;
  timezone: string;
  attendeeEmails: string[];
  notes?: string;
};

export type CreateEventResult = {
  provider: "mock" | "google";
  eventId: string;
  htmlLink?: string;
  meetLink?: string;
};

export interface CalendarPort {
  readonly provider: "mock" | "google";
  getFreeBusy(query: FreeBusyQuery): Promise<FreeBusyResult>;
  createEvent(input: CreateEventInput): Promise<CreateEventResult>;
}
