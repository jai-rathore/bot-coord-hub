import {
  AGENT_CLIENTS,
  STANDING_CHECK_INTERVAL_MINUTES,
  standingCheckInstruction,
  standingCheckPrompt,
} from "@/lib/agent-clients";

export const PRODUCTION_ORIGIN = "https://honeymatcha.io";

/**
 * Where this deployment lives.
 *
 * The single resolver for agent-facing copy: `events/notify` delegates here so
 * an email link and an inbox link can never disagree about the origin.
 */
export function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() ||
    process.env.APP_ORIGIN?.trim() ||
    PRODUCTION_ORIGIN
  );
}

export const GROK_BOT_URL = "https://x.ai/bot";
export const MCP_URL = `${PRODUCTION_ORIGIN}/api/mcp`;

/** Preferred human path: Plugins → Authorize. */
export const GROK_BOT_PLUGIN_STEPS = `1. Open Grok Bot → Plugins
2. Add HoneyMatcha (or custom MCP URL ${MCP_URL})
3. Click Authorize and sign in to HoneyMatcha in your browser
4. Use @HoneyMatcha in chat, and connect Google Calendar at ${PRODUCTION_ORIGIN}/app/settings`;

/** The one sentence a human should say to their personal agent (pairing fallback). */
export const ASK_AGENT_PROMPT =
  "Connect to https://honeymatcha.io as my agent.";

export const GROK_BOT_CONNECT_PROMPT = `${ASK_AGENT_PROMPT}

Preferred path: ask me to add HoneyMatcha in Grok Bot Plugins (custom MCP URL ${MCP_URL}) and Authorize in my browser. If Plugins MCP tools are already available, use them and call get_inbox every turn.

If Plugins / MCP OAuth is unavailable, use the terminal on your persistent cloud computer to complete the pairing steps below. Do not sign in as me, ask for my password, or solve CAPTCHA. I will approve the connection in my own browser.

1. POST https://honeymatcha.io/api/v1/pairings/start with JSON {"agentName":"<your Bot name>"}
2. Show me the verificationUrl so I can open it and approve
3. Poll POST https://honeymatcha.io/api/v1/pairings/token with {"deviceCode":"<deviceCode from step 1>"} until you receive an hm_ credential
4. Store that credential securely on your Grok Bot computer and GET https://honeymatcha.io/api/v1/me with Authorization: Bearer <hm_...>
5. After that, use POST https://honeymatcha.io/api/mcp with the same Bearer token, or the REST API under /api/v1
6. Call get_inbox at the start of every turn. That is how HoneyMatcha reaches you when another agent starts a task.
7. Call whoami, read standingCheck, and create the requested recurring get_inbox schedule if your host supports schedules. Keep it silent when nothing is pending.

If a step fails, stop and show me the exact error. Do not fall back to signing in as me.`;

export const FRIEND_INVITE_MESSAGE = `Hey: can you sign up at https://honeymatcha.io?

Connect Google Calendar when the site asks. Then point whatever assistant you already use: Claude, ChatGPT, Gemini, Grok: at https://honeymatcha.io/api/mcp and approve it in your browser (or just tell it: connect to honeymatcha.io as my agent). Setup steps for each one, plus how to make it check on a schedule, are at https://honeymatcha.io/docs.

Then accept my invite: PASTE_INVITE_URL_HERE`;

/**
 * What an MCP client is told the moment it connects.
 *
 * This fires exactly once per connection, which makes it the only place we can
 * reliably ask an agent to set up its standing check before it has any work to
 * do. Repeating it on every tool call would be noise.
 */
export function mcpConnectInstructions(): string {
  return [
    "HoneyMatcha MCP. Call get_inbox at the start of every turn. That is how this platform reaches you when someone else's agent starts a task with your human.",
    "If inbox.pending > 0, handle that work before anything else.",
    standingCheckInstruction(),
    "Never book Google Calendar yourself.",
  ].join(" ");
}

export function agentLlmsText(origin = PRODUCTION_ORIGIN): string {
  const base = origin.replace(/\/$/, "");
  return `# HoneyMatcha
HoneyMatcha is how two people's agents plan together. Each human keeps ChatGPT, Claude, Gemini, Grok, Cursor, or HoneyMatcha's included agent Sage. Agents compare free/busy time and chase replies. Humans approve every booking.
Human how-to: ${base}/how-to-connect-agents
Connect an assistant: ${base}/agents
MCP: ${base}/api/mcp

## For agents

HoneyMatcha is a coordination platform for a human and their personal agent.
It is not a chat app or a message board.

The human signs in at ${base}. The connect path is remote MCP with OAuth: add
${base}/api/mcp in whichever assistant the human already uses. HoneyMatcha
supports dynamic client registration, so no vendor-specific setup and no
pre-shared client secret is needed. Device-code pairing remains available for
agents with a terminal. The agent then does the coordination work (schedule a
meeting, hiring compatibility, guest asks). The human approves important
actions in the browser.

## Connect: remote MCP + OAuth

1. Human adds ${base}/api/mcp in their assistant's connector settings.
2. Human authorizes at ${base}/oauth/authorize: never as the agent.
3. Agent uses MCP tools. Call get_inbox at the start of every turn.
4. Calendar booking needs Connect Calendar at ${base}/app/settings.

Where that setting lives, per assistant:

${AGENT_CLIENTS.map(
  (client) =>
    `- ${client.name}: ${client.connectSteps.join(" ")}${
      client.caveat ? ` (${client.caveat})` : ""
    }`,
).join("\n")}

OAuth metadata:
- ${base}/.well-known/oauth-protected-resource
- ${base}/.well-known/oauth-authorization-server

## If a human says: connect to honeymatcha.io as my agent

Do this immediately when Plugins tools are not available. Never sign in as the human. Never solve CAPTCHA. Never ask for their password.

1. POST ${base}/api/v1/pairings/start
   Content-Type: application/json
   {"agentName":"<your name>"}
2. Show the human the returned verificationUrl. They approve in their browser.
3. Poll POST ${base}/api/v1/pairings/token
   {"deviceCode":"<deviceCode from step 1>"}
   Wait the returned interval while status is authorization_pending.
4. Store the hm_ credential. Verify with GET ${base}/api/v1/me
   Authorization: Bearer hm_...
5. Use MCP at POST ${base}/api/mcp or REST under ${base}/api/v1.

Discovery: ${base}/.well-known/honeymatcha.json
Agent card: ${base}/.well-known/agent-card.json
Docs: ${base}/docs

Share free/busy only. Never peer calendar event titles.

## How HoneyMatcha reaches you

Call get_inbox (GET /api/v1/inbox) at the start of every turn. When another
person's agent starts a task with your human, HoneyMatcha writes it here.
whoami also returns inbox.pending: if that is greater than 0, handle inbox
before anything else.

That covers turns your human starts. It does not cover the rest of the day,
and coordination is mostly the rest of the day: someone else's agent proposes
a time, an event deadline closes, an introduction lands. HoneyMatcha cannot
interrupt a hosted assistant to tell you: there is no open stream to push
down, and Claude, ChatGPT, Gemini and Grok cannot receive an inbound webhook.

So schedule the check yourself, the first time you connect. Every assistant
listed above can run a saved prompt on a schedule:

${AGENT_CLIENTS.filter((client) => client.standingCheck)
  .map((client) => `- ${client.name}: ${client.standingCheck?.featureName}`)
  .join("\n")}

Save this on a ${STANDING_CHECK_INTERVAL_MINUTES}-minute schedule. Staying silent
on an empty inbox is the part that makes it survivable: never report "nothing
to do" on a timer.

\`\`\`
${standingCheckPrompt(base)}
\`\`\`

whoami and get_inbox both return a standingCheck object with that interval, the
prompt text, and whether something else already covers you.

If you do have a public HTTPS URL: a self-hosted agent, a worker, a
Cloudflare tunnel: call register_agent_callback instead and HoneyMatcha will
POST to it the moment work arrives. That sets standingCheck.satisfied.

## Scheduling

Call request_schedule_meeting with the other person's email. HoneyMatcha
delivers that request to their agent inbox when they have a HoneyMatcha
account. If they do not, the response has scheduled=false and a share_url
for your human to send.

If a human shares a ${base}/:handle link, call get_agent_profile with that
handle, then request_agent_connection after they approve. Do not sign in as
them. The other human must approve before either agent can coordinate.

If request_schedule_meeting says a calendar is required, tell the human to
Connect Calendar at ${base}/app/settings. Do not call create_session as a
workaround, and do not create a schedule_meeting session with no peer.

## Group events

An event is one shareable link that resolves on a deadline and an optional
quorum. It never waits for everyone, and the organizer confirms before
anything is booked.

You can be on either side of one.

Organizing: create_event, add_event_option, extend_event_deadline,
nudge_event_participants.

Taking part: get_event_board, join_event, respond_to_event,
suggest_event_option. If your human pastes you a ${base}/e/<slug> link, pass
it straight to get_event_board: event id, bare slug, and full URL all work.

respond_to_event marks each time yes/no/maybe and says whether your human is
coming. It joins the event for you, so a link plus an answer is one call. Ask
your human what works first. Never guess their availability, and never answer
for someone else.

lock_event, cancel_event and confirm_event do not exist for agents. Those stay
the organizer's own buttons in the browser. If your human wants one, tell them
where it is rather than retrying.

Event news arrives in the same inbox as everything else: you were invited,
someone joined, the deadline is close, it locked, it is confirmed. Each item
carries an eventId: pass it to get_event_board.

To also hear when individual people answer or suggest times, call
set_event_notifications with the event link. Updates then land in get_inbox
(and your human's email). Pass notify=false to stop. Subscribe when your human
cares about an event; do not subscribe to everything.

## Meeting someone in person

When your human meets someone and has their handle, call record_meeting with
that handle and one of coffee, lunch, drinks, call, or connect. It sends an
approval-gated connection request and, for anything but connect, opens a
two-person event already seeded with candidate times, so the plan survives the
walk home. Pass your human's IANA timezone or the times land in UTC.

Scanning or asserting a meeting never connects two people by itself. The other
human still approves.

Never create a Google Calendar event yourself. Never claim the other person
accepted. Booking happens only after they join, both calendars are connected,
and both humans approve on HoneyMatcha.
`;
}
