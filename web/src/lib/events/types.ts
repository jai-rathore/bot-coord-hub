/** Shared shapes for the events projection. Kept free of Drizzle imports so
 *  resolve.ts and board.ts stay unit-testable without a database. */

export type EventVisibility = "open" | "counts_only" | "blind";
export type EventPref = "yes" | "no" | "maybe";
export type EventAttendance = "pending" | EventPref;
export type EventDimensionKind = "time" | "place" | "attendance" | "custom";
export type EventDimensionMode = "fixed" | "open";
export type EventStatus =
  | "draft"
  | "open"
  | "locked"
  | "confirmed"
  | "cancelled"
  | "expired";

export type ViewerRole = "organizer" | "participant" | "public";

export type NoteVisibility = "everyone" | "organizer";
export type NoteSource = "chat" | "ui";

/** One note, already filtered to what the viewer is permitted to see. */
export type NoteView = {
  id: string;
  body: string;
  visibility: NoteVisibility;
  source: NoteSource;
  /** Set when the note is about one specific option. */
  optionId: string | null;
  optionLabel: string | null;
  authorName: string;
  isMine: boolean;
  isOrganizerAuthor: boolean;
  createdAt: string;
  /** The author can take their own words back. */
  canRetract: boolean;
  /** The organizer can take anyone's off the board. */
  canRemove: boolean;
};

/** Below this many responses, counts_only would disclose identity, so counts
 *  are suppressed entirely. See plan §2. */
export const MIN_COUNT_DISCLOSURE = 3;

export type OptionTally = {
  id: string;
  dimensionId: string;
  label: string | null;
  startsAt: string | null;
  endsAt: string | null;
  capacity: number | null;
  position: number;
  status: string;
  createdByRole: string;
  /** Null when the viewer is not permitted to see aggregates. */
  yes: number | null;
  maybe: number | null;
  no: number | null;
  score: number | null;
  /** Null when the viewer may not see who voted. */
  voters: Array<{ participantId: string; name: string; value: EventPref }> | null;
  /** The viewer's own preference, when they are a participant. */
  mine: EventPref | null;
  atCapacity: boolean;
};

export type DimensionView = {
  id: string;
  kind: EventDimensionKind;
  label: string;
  mode: EventDimensionMode;
  position: number;
  resolvedOptionId: string | null;
  options: OptionTally[];
};

export type ParticipantView = {
  id: string;
  userId: string;
  name: string;
  role: string;
  attendance: EventAttendance;
  respondedAt: string | null;
  isOrganizer: boolean;
};

export type EventBoard = {
  event: {
    id: string;
    publicId: string;
    shareSlug: string;
    title: string;
    description: string | null;
    timezone: string;
    status: EventStatus;
    visibility: EventVisibility;
    lockPolicy: "on_quorum" | "at_deadline" | "manual";
    quorumMin: number | null;
    capacityMax: number | null;
    deadlineAt: string;
    lockedAt: string | null;
    confirmedAt: string | null;
    agentMode: string;
    agentName: string;
    allowChat: boolean;
    allowGuestOptions: boolean;
    organizerName: string;
    createdAt: string;
  };
  viewer: {
    role: ViewerRole;
    participantId: string | null;
    attendance: EventAttendance | null;
    hasResponded: boolean;
    canRespond: boolean;
    /** Null until the viewer has joined. */
    notifyUpdates: boolean | null;
    /** Account preference. Public viewers default to email. */
    notifyChannel: "email" | "sms" | "both";
    /** Whether this signed-in viewer already has a number on file. */
    hasPhone: boolean;
    /** False until TWILIO_FROM_NUMBER is set. Hides Text in the UI. */
    smsEnabled: boolean;
  };
  dimensions: DimensionView[];
  /** Null when the viewer may not see the roster. */
  participants: ParticipantView[] | null;
  counts: {
    joined: number | null;
    responded: number | null;
    pending: number | null;
  };
  leader: {
    dimensionId: string;
    optionId: string;
    score: number;
    yes: number;
  } | null;
  quorum: {
    required: number | null;
    /** Null when the viewer may not see aggregates — never a plain false. */
    met: boolean | null;
    leadingYes: number | null;
  };
  /** One-line, paste-ready status. Always safe for the viewer to see. */
  summary: string;
  countsSuppressed: boolean;
  /** Free text people added, already filtered to what this viewer may see. */
  notes: NoteView[];
  /** Sage's rollup of the shared notes, or a deterministic one. Null when none. */
  notesSummary: string | null;
  /** True when the summary came from the model rather than the fallback. */
  notesDigestIsLive: boolean;
  /** False for anonymous visitors and cancelled events. */
  canPostNote: boolean;
};
