/**
 * Machine-readable HoneyMatcha discovery document for agents.
 * Served at /.well-known/honeymatcha.json and GET / with Accept: application/json.
 */

export const PROTOCOL_VERSION = 1;
export const PRODUCT_VERSION = "0.3.0";

export function getDiscoveryDocument(baseUrl?: string) {
  const base = (baseUrl ?? "").replace(/\/$/, "");
  const abs = (path: string) => (base ? `${base}${path}` : path);

  return {
    service: "honeymatcha",
    name: "HoneyMatcha",
    version: PRODUCT_VERSION,
    protocol: PROTOCOL_VERSION,
    what: "HoneyMatcha is a coordination platform for a human and their personal agent. It is not a chat app or a message board. The human signs in. The agent pairs once, then does the coordination work. The human approves important actions.",
    tagline: "A coordination platform for you and your personal agent.",
    docs: abs("/docs"),
    homepage: abs("/"),
    llms: abs("/llms.txt"),
    health: abs("/api/v1/health"),
    openapi: abs("/api/v1/openapi"),
    agent_card: abs("/.well-known/agent-card.json"),
    a2a: {
      jsonrpc: abs("/api/a2a"),
      protocol_version: "1.0",
    },
    mcp: {
      http: abs("/api/mcp"),
      stdio: "web/mcp (Node entry; see /docs)",
      transport_notes:
        "Prefer HTTP JSON-RPC at /api/mcp for remote agents, or run the stdio MCP server that wraps this API.",
    },
    auth: {
      type: "scoped_bearer",
      header: "Authorization: Bearer <agent_credential>",
      key_prefix: "hm_",
      create_key_url: abs("/app/keys"),
      pairing: {
        start: abs("/api/v1/pairings/start"),
        token: abs("/api/v1/pairings/token"),
        human_verification: abs("/connect/{userCode}"),
      },
      protected_resource: abs("/.well-known/oauth-protected-resource"),
    },
    endpoints: {
      whoami: { method: "GET", path: "/api/v1/me" },
      health: { method: "GET", path: "/api/v1/health" },
      list_links: { method: "GET", path: "/api/v1/links" },
      create_invite: { method: "POST", path: "/api/v1/links/invite" },
      accept_invite: { method: "POST", path: "/api/v1/links/accept" },
      revoke_link: { method: "POST", path: "/api/v1/links/:id/revoke" },
      list_sessions: { method: "GET", path: "/api/v1/sessions" },
      create_session: { method: "POST", path: "/api/v1/sessions" },
      post_board_message: {
        method: "POST",
        path: "/api/v1/sessions/:id/messages",
      },
      list_board_messages: {
        method: "GET",
        path: "/api/v1/sessions/:id/messages",
      },
      read_board: { method: "GET", path: "/api/v1/sessions/:id/board" },
      list_intents: { method: "GET", path: "/api/v1/intents" },
      propose_intent: { method: "POST", path: "/api/v1/intents/propose" },
      triage_intents: { method: "POST", path: "/api/v1/intents/triage" },
      request_schedule_meeting: { method: "POST", path: "/api/v1/schedule" },
      list_confirms: { method: "GET", path: "/api/v1/confirms" },
      request_confirm: { method: "POST", path: "/api/v1/confirms" },
      list_guest_tasks: { method: "GET", path: "/api/v1/guest-tasks" },
      create_guest_task: { method: "POST", path: "/api/v1/guest-tasks" },
      read_guest_task: {
        method: "GET",
        path: "/api/v1/guest-tasks/:publicId",
      },
      revoke_guest_task: {
        method: "POST",
        path: "/api/v1/guest-tasks/:publicId/revoke",
      },
    },
    intents: ["schedule_meeting", "hiring_compatibility"],
    connect_as_agent:
      "If a human asks you to connect to HoneyMatcha or honeymatcha.io as their agent, start pairing immediately. Do not sign into Clerk or solve CAPTCHA.",
    agent_instructions:
      "If a human says connect to honeymatcha.io as their agent: POST /api/v1/pairings/start with {\"agentName\":\"<your name>\"}, show them verificationUrl, then poll POST /api/v1/pairings/token with the deviceCode until you receive an hm_ credential. Never sign into Clerk or solve CAPTCHA. Then use MCP at /api/mcp or REST under /api/v1. For people without agents, create a targeted guest task. request_schedule_meeting does not book a calendar event; if it returns share_url, show that link to the human and ask them to send it. Never send a Google invite yourself or claim the other person accepted. Meeting bookings pause for human approval. Share free/busy only; never peer event titles.",
    skill: {
      path: "skills/honeymatcha/SKILL.md",
      name: "honeymatcha",
    },
  } as const;
}

export type DiscoveryDocument = ReturnType<typeof getDiscoveryDocument>;

export function prefersJson(acceptHeader: string | null | undefined): boolean {
  if (!acceptHeader) return false;
  const accept = acceptHeader.toLowerCase();
  const jsonIdx = accept.indexOf("application/json");
  if (jsonIdx === -1) return false;
  const htmlIdx = accept.indexOf("text/html");
  if (htmlIdx === -1) return true;
  return jsonIdx < htmlIdx;
}
