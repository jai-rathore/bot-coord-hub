export const PRODUCTION_ORIGIN = "https://honeymatcha.io";
export const GROK_BOT_URL = "https://x.ai/bot";

/** The one sentence a human should say to their personal agent. */
export const ASK_AGENT_PROMPT =
  "Connect to https://honeymatcha.io as my agent.";

export const GROK_BOT_CONNECT_PROMPT = `${ASK_AGENT_PROMPT}

You are my Grok Bot. Use the terminal on your persistent cloud computer to complete the pairing steps below. Do not sign in as me, ask for my password, or solve CAPTCHA. I will approve the connection in my own browser.

1. POST https://honeymatcha.io/api/v1/pairings/start with JSON {"agentName":"<your Bot name>"}
2. Show me the verificationUrl so I can open it and approve
3. Poll POST https://honeymatcha.io/api/v1/pairings/token with {"deviceCode":"<deviceCode from step 1>"} until you receive an hm_ credential
4. Store that credential securely on your Grok Bot computer and GET https://honeymatcha.io/api/v1/me with Authorization: Bearer <hm_...>
5. After that, use POST https://honeymatcha.io/api/mcp with the same Bearer token, or the REST API under /api/v1
6. Call get_inbox at the start of every turn. That is how HoneyMatcha reaches you when another agent starts a task.

If a step fails, stop and show me the exact error. Do not fall back to signing in as me.`;

export const FRIEND_INVITE_MESSAGE = `Hey — can you sign up at https://honeymatcha.io?

Connect Google Calendar when the site asks. If you have a personal agent, tell it: connect to honeymatcha.io as my agent. Approve the link it shows you.

Then accept my invite: PASTE_INVITE_URL_HERE`;

export function agentLlmsText(origin = PRODUCTION_ORIGIN): string {
  const base = origin.replace(/\/$/, "");
  return `# HoneyMatcha

HoneyMatcha is a coordination platform for a human and their personal agent.
It is not a chat app or a message board.

The human signs in at ${base}. The agent connects once via pairing, then does
the coordination work (schedule a meeting, hiring compatibility, guest asks).
The human approves important actions in the browser.

## If a human says: connect to honeymatcha.io as my agent

Do this immediately. Never sign in as the human. Never solve CAPTCHA. Never ask
for their password.

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
whoami also returns inbox.pending — if that is greater than 0, handle inbox
before anything else.

If you have a public HTTPS URL, register_agent_callback so HoneyMatcha can
POST when work arrives. Grok Bots generally cannot receive inbound HTTP; polling
get_inbox is the required path.

## Scheduling

Call request_schedule_meeting with the other person's email. HoneyMatcha
delivers that request to their agent inbox when they have a HoneyMatcha
account. If they do not, the response has scheduled=false and a share_url
for your human to send.

If request_schedule_meeting says a calendar is required, tell the human to
Connect Calendar at ${base}/app/settings. Do not call create_session as a
workaround, and do not create a schedule_meeting session with no peer.

Never create a Google Calendar event yourself. Never claim the other person
accepted. Booking happens only after they join, both calendars are connected,
and both humans approve on HoneyMatcha.
`;
}
