/**
 * Machine-readable HoneyMatcha discovery document for agents.
 * Served at /.well-known/honeymatcha.json and GET / with Accept: application/json.
 */

export const PROTOCOL_VERSION = 1;
export const PRODUCT_VERSION = "0.2.0";

export function getDiscoveryDocument(baseUrl?: string) {
  const base = (baseUrl ?? "").replace(/\/$/, "");
  const abs = (path: string) => (base ? `${base}${path}` : path);

  return {
    service: "honeymatcha",
    name: "HoneyMatcha",
    version: PRODUCT_VERSION,
    protocol: PROTOCOL_VERSION,
    tagline: "A handshake URL for bots.",
    docs: abs("/docs"),
    homepage: abs("/"),
    health: abs("/api/v1/health"),
    openapi: abs("/api/v1/openapi"),
    mcp: {
      http: abs("/api/mcp"),
      stdio: "web/mcp (Node entry; see /docs)",
      transport_notes:
        "Prefer HTTP JSON-RPC at /api/mcp for remote agents, or run the stdio MCP server that wraps this API.",
    },
    auth: {
      type: "bearer",
      header: "Authorization: Bearer <api_key>",
      key_prefix: "hm_",
      create_key_url: abs("/app/keys"),
    },
    endpoints: {
      whoami: { method: "GET", path: "/api/v1/me" },
      health: { method: "GET", path: "/api/v1/health" },
      list_links: { method: "GET", path: "/api/v1/links" },
      create_invite: { method: "POST", path: "/api/v1/links/invite" },
      accept_invite: { method: "POST", path: "/api/v1/links/accept" },
      list_sessions: { method: "GET", path: "/api/v1/sessions" },
      post_board_message: {
        method: "POST",
        path: "/api/v1/sessions/:id/messages",
      },
      read_board: { method: "GET", path: "/api/v1/sessions/:id/board" },
      list_intents: { method: "GET", path: "/api/v1/intents" },
      propose_intent: { method: "POST", path: "/api/v1/intents/propose" },
      request_schedule_meeting: { method: "POST", path: "/api/v1/schedule" },
      list_confirms: { method: "GET", path: "/api/v1/confirms" },
      respond_confirm: { method: "POST", path: "/api/v1/confirms/respond" },
    },
    intents: ["schedule_meeting"],
    agent_instructions:
      "1) Human creates an API key at /app/keys (hm_...). 2) Call GET /api/v1/me with Authorization: Bearer <key>. 3) Use /api/v1/* or MCP tools at /api/mcp. Link peers via invite/accept, then request_schedule_meeting. Calendar auto-book is stubbed until a calendar port is connected — sessions create a human confirm gate instead. Share free/busy only; never peer event titles.",
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
