export const PRODUCTION_ORIGIN = "https://honeymatcha.io";

/** The one sentence a human should say to their personal agent. */
export const ASK_AGENT_PROMPT =
  "Connect to https://honeymatcha.io as my agent.";

export const GROK_CONNECT_PROMPT = `${ASK_AGENT_PROMPT}

Do not sign into Clerk or solve CAPTCHA. I will approve the connection in my own browser.

1. POST https://honeymatcha.io/api/v1/pairings/start with JSON {"agentName":"Grok"}
2. Show me the verificationUrl so I can open it and approve
3. Poll POST https://honeymatcha.io/api/v1/pairings/token with {"deviceCode":"<deviceCode from step 1>"} until you receive an hm_ credential
4. Store that credential and GET https://honeymatcha.io/api/v1/me with Authorization: Bearer <hm_...>
5. After that, use POST https://honeymatcha.io/api/mcp with the same Bearer token, or the REST API under /api/v1

If you cannot make those HTTP calls, tell me. I will create a key at https://honeymatcha.io/app/keys and add a custom MCP connector at https://grok.com/connectors with URL https://honeymatcha.io/api/mcp.`;

export const FRIEND_INVITE_MESSAGE = `Hey — can you sign up at https://honeymatcha.io?

Connect Google Calendar when the site asks. If you have a personal agent, tell it: connect to honeymatcha.io as my agent. Approve the link it shows you.

Then accept my invite: PASTE_INVITE_URL_HERE`;

export const GROK_MCP_CLI = `export HONEYMATCHA_API_KEY=hm_...
grok mcp add --transport http honeymatcha https://honeymatcha.io/api/mcp \\
  --header "Authorization: Bearer \${HONEYMATCHA_API_KEY}"`;

export function agentLlmsText(origin = PRODUCTION_ORIGIN): string {
  const base = origin.replace(/\/$/, "");
  return `# HoneyMatcha

HoneyMatcha is a coordination platform for a human and their personal agent.
It is not a chat app or a message board.

The human signs in at ${base}. The agent connects once via pairing, then does
the coordination work (schedule a meeting, hiring compatibility, guest asks).
The human approves important actions in the browser.

## If a human says: connect to honeymatcha.io as my agent

Do this immediately. Never sign into Clerk. Never solve CAPTCHA. Never ask
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

## Scheduling

Call request_schedule_meeting with the other person's email. If the response
has scheduled=false or a share_url, the meeting is not booked. Show the human
the share_url and ask them to send it. HoneyMatcha does not email people.

Never create a Google Calendar event yourself. Never claim the other person
accepted. Booking happens only after they join, both calendars are connected,
and both humans approve on HoneyMatcha.
`;
}
