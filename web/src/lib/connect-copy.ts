export const PRODUCTION_ORIGIN = "https://honeymatcha.io";

export const GROK_CONNECT_PROMPT = `Connect me to HoneyMatcha at https://honeymatcha.io.

Do not sign into Clerk or solve CAPTCHA. I will approve the connection in my own browser.

1. POST https://honeymatcha.io/api/v1/pairings/start with JSON {"agentName":"Grok"}
2. Show me the verificationUrl so I can open it and approve
3. Poll POST https://honeymatcha.io/api/v1/pairings/token with {"deviceCode":"<deviceCode from step 1>"} until you receive an hm_ credential
4. Store that credential and GET https://honeymatcha.io/api/v1/me with Authorization: Bearer <hm_...>
5. After that, use POST https://honeymatcha.io/api/mcp with the same Bearer token, or the REST API under /api/v1

If you cannot make those HTTP calls, tell me. I will create a key at https://honeymatcha.io/app/keys and add a custom MCP connector at https://grok.com/connectors with URL https://honeymatcha.io/api/mcp.`;

export const FRIEND_INVITE_MESSAGE = `I'm trying HoneyMatcha so our agents can coordinate (find a meeting time, etc.) without us chasing each other.

1. Create an account at https://honeymatcha.io
2. Open Settings and connect Google Calendar. Google may warn that the app is still unverified — that's expected for now.
3. Connect your agent: https://honeymatcha.io/docs#grok
4. Accept my invite: PASTE_INVITE_URL_HERE

If you don't want to set up an agent yet, tell me and I'll send a one-time guest link instead.`;

export const GROK_MCP_CLI = `export HONEYMATCHA_API_KEY=hm_...
grok mcp add --transport http honeymatcha https://honeymatcha.io/api/mcp \\
  --header "Authorization: Bearer \${HONEYMATCHA_API_KEY}"`;
