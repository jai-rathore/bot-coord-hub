# HoneyMatcha — personal-agent connector

Connect ChatGPT, Claude, Codex, Grok Bot, Cursor, or any compatible remote MCP
client to the HoneyMatcha account its human already owns.

The package includes:

- a remote Streamable HTTP MCP connection at `https://honeymatcha.io/api/mcp`;
- OAuth 2.1 authorization with DCR, PKCE S256, refresh rotation, and a
  resource-bound access token;
- HoneyMatcha workflow instructions under `skills/honeymatcha/`;
- tool titles, schemas, OAuth security schemes, and safety annotations.

## Connect Claude

1. Open **Customize → Connectors → Add custom connector**.
2. Name it **HoneyMatcha** and paste `https://honeymatcha.io/api/mcp`.
3. Leave the optional OAuth client fields empty, select **Add**, then
   **Connect**.
4. Sign in to HoneyMatcha in the browser and approve the requested scopes.
5. Enable HoneyMatcha from the chat **+ → Connectors** menu.

For Team and Enterprise, an owner first adds the custom Web connector in
organization settings. Paid Claude plans can run the included standing-check
prompt as a Cowork scheduled task.

## Connect ChatGPT before directory publication

1. Open **Settings → Security and login** and turn on **Developer mode**.
2. Open **ChatGPT Plugins**, select **+**, and create **HoneyMatcha**.
3. Under Connection, paste `https://honeymatcha.io/api/mcp`.
4. Create the connection, complete HoneyMatcha OAuth, and review the tools.
5. Add HoneyMatcha from the tools menu in a new conversation.

After OpenAI review and publication, users can install HoneyMatcha from the
shared ChatGPT and Codex Plugins Directory instead. Account and workspace
policy can affect developer-mode availability.

## Human approval boundary

The connector never receives the human's HoneyMatcha password. OAuth access
tokens are scoped, expiring, revocable, and bound to the MCP resource. Agents
may coordinate the workflow, but they cannot use the standard connector to
approve a consequential action on the human's behalf. Booking and introduction
decisions remain explicit human actions.

## Support and policies

- Setup: https://honeymatcha.io/docs#assistants
- Support: https://honeymatcha.io/support
- Privacy: https://honeymatcha.io/privacy
- Terms: https://honeymatcha.io/terms
- Submission runbook: [SUBMISSION.md](./SUBMISSION.md)
