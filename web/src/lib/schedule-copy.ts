export type WaitingPeer = {
  email: string;
  name: string | null;
  userId: string | null;
  onHoneyMatcha: boolean;
  linked: boolean;
  inviteUrl: string;
  guestUrl: string | null;
  reason: "not_on_honeymatcha" | "invite_pending" | "calendar_missing";
};

export function buildScheduleWaitingResult(opts: {
  sessionId: string | null;
  title: string;
  waiting: WaitingPeer[];
  calendarsMissing?: string[];
}) {
  const primary = opts.waiting[0];
  const shareUrl = primary?.guestUrl || primary?.inviteUrl || null;
  const emails = opts.waiting.map((p) => p.email);
  const calendarNote =
    opts.calendarsMissing && opts.calendarsMissing.length > 0
      ? ` Still waiting on a connected calendar for: ${opts.calendarsMissing.join(", ")}.`
      : "";

  const who = primary?.email ?? "them";
  const agent_instructions = [
    "Do not book a Google Calendar event.",
    "Do not send a calendar invite yourself.",
    "Do not tell the human this meeting is confirmed or that the other person accepted.",
    shareUrl
      ? `HoneyMatcha does not email ${who}. Show the human this link and ask them to send it: ${shareUrl}`
      : `HoneyMatcha does not email ${who}. Ask the human to invite them from People.`,
    "Wait until they join HoneyMatcha and their agent replies here.",
  ].join(" ");

  return {
    ok: true,
    scheduled: false,
    booked: false,
    waiting_for_peer: true,
    sessionId: opts.sessionId,
    title: opts.title,
    share_url: primary?.inviteUrl ?? null,
    guest_url: primary?.guestUrl ?? null,
    people: opts.waiting,
    emails,
    message: `Not booked. ${who} has not confirmed on HoneyMatcha.${calendarNote}`,
    agent_instructions,
    next_steps: [
      shareUrl
        ? `Send this link to ${who}: ${shareUrl}`
        : `Invite ${who} from People and send them the invite URL.`,
      "Wait for them to join and connect a calendar.",
      "Only then will HoneyMatcha propose times from both calendars and ask humans to approve before booking.",
    ],
  };
}

export const SCHEDULE_MEETING_TOOL_DESCRIPTION =
  "Start coordinating a meeting on HoneyMatcha. This does not book a calendar event and does not send a Google invite. If the other person is not on HoneyMatcha or has not accepted a link, it returns share_url / guest_url — show that link to your human and ask them to send it. Never invent a confirmed time. Never book on Google Calendar yourself. Never claim the other person accepted. Booking happens only after they join, both calendars are connected, and both humans approve.";
