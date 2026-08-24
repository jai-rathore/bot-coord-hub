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
  agentNotify?: Array<{
    email: string;
    reach: string;
    hasPairedAgent: boolean;
  }>;
}) {
  const primary = opts.waiting[0];
  const shareUrl = primary?.guestUrl || primary?.inviteUrl || null;
  const emails = opts.waiting.map((p) => p.email);
  const calendarNote =
    opts.calendarsMissing && opts.calendarsMissing.length > 0
      ? ` Still waiting on a connected calendar for: ${opts.calendarsMissing.join(", ")}.`
      : "";

  const who = primary?.email ?? "them";
  const notify = opts.agentNotify?.[0];
  const reachedSage = notify?.reach === "delivered_to_sage";
  const reachedAgent = notify?.reach === "delivered_to_agent";
  const reachedOperator = reachedSage || reachedAgent;
  const agent_instructions = [
    "Do not book a Google Calendar event.",
    "Do not send a calendar invite yourself.",
    "Do not tell the human this meeting is confirmed or that the other person accepted.",
    reachedOperator
      ? reachedSage
        ? `HoneyMatcha put this on ${who}'s Sage inbox. Wait for Sage and their human to reply here.`
        : `HoneyMatcha put this on ${who}'s agent inbox. Wait for their agent to reply here.`
      : shareUrl
        ? `HoneyMatcha could not reach ${who}'s agent yet. Show the human this link and ask them to send it: ${shareUrl}`
        : `HoneyMatcha could not reach ${who}'s agent yet. Ask the human to invite them from People.`,
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
    agent_notified: opts.agentNotify ?? [],
    message: reachedOperator
      ? reachedSage
        ? `Not booked. Reached ${who}'s Sage inbox. Waiting for Sage and their human.${calendarNote}`
        : `Not booked. Reached ${who}'s agent inbox. Waiting for their agent.${calendarNote}`
      : `Not booked. ${who} has not confirmed on HoneyMatcha.${calendarNote}`,
    agent_instructions,
    next_steps: reachedOperator
      ? [
          reachedSage
            ? "Wait for Sage to review the HoneyMatcha inbox item with their human."
            : "Wait for their agent to pick up the HoneyMatcha inbox item.",
          "Do not book Google yourself.",
        ]
      : [
          shareUrl
            ? `Send this link to ${who}: ${shareUrl}`
            : `Invite ${who} from People and send them the invite URL.`,
          "Once they connect an agent, HoneyMatcha will reach that agent automatically.",
        ],
  };
}

export const SCHEDULE_MEETING_TOOL_DESCRIPTION =
  "Start coordinating a meeting on HoneyMatcha. This does not book a calendar event and does not send a Google invite. If the other person is not on HoneyMatcha or has not accepted a link, it returns share_url / guest_url: show that link to your human and ask them to send it. If a calendar is required, tell the human to Connect Calendar at /app/settings: do not call create_session. Never invent a confirmed time. Never book on Google Calendar yourself. Never claim the other person accepted. Booking happens only after they join, both calendars are connected, and both humans approve.";
