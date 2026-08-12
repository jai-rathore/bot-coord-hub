#!/usr/bin/env node
/**
 * HoneyMatcha stdio MCP server.
 *
 * Wraps the remote Agent API (/api/v1/* and /api/mcp) so local MCP hosts
 * (Cursor, Claude Desktop, etc.) can use tools with:
 *
 *   HONEYMATCHA_BASE_URL=https://your-host
 *   HONEYMATCHA_API_KEY=hm_...
 *
 * No secrets are hardcoded. Run from repo:
 *   node web/mcp/server.mjs
 */

import { createInterface } from "node:readline";

const BASE = (process.env.HONEYMATCHA_BASE_URL || "").replace(/\/$/, "");
const KEY = process.env.HONEYMATCHA_API_KEY || "";

const TOOLS = [
  {
    name: "whoami",
    description: "Health check for the HoneyMatcha API key.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_links",
    description: "List peer links for the authenticated user.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_invite",
    description: "Create a peer invite. Share inviteCode out-of-band.",
    inputSchema: {
      type: "object",
      properties: {
        toEmail: { type: "string" },
        toName: { type: "string" },
        scopes: { type: "array", items: { type: "string" } },
      },
      required: ["toEmail"],
    },
  },
  {
    name: "accept_invite",
    description: "Accept a peer invite by inviteCode.",
    inputSchema: {
      type: "object",
      properties: { inviteCode: { type: "string" } },
      required: ["inviteCode"],
    },
  },
  {
    name: "list_sessions",
    description: "List coordination sessions.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "post_board_message",
    description: "Post a message to a session board.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        kind: { type: "string" },
        body: { type: "object", additionalProperties: true },
      },
      required: ["sessionId", "kind"],
    },
  },
  {
    name: "read_board",
    description: "Read a session board.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
    },
  },
  {
    name: "list_intents",
    description: "List intent registry entries.",
    inputSchema: {
      type: "object",
      properties: { q: { type: "string" } },
    },
  },
  {
    name: "propose_intent",
    description: "Propose a new intent type.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        slug: { type: "string" },
        description: { type: "string" },
        force: { type: "boolean" },
      },
      required: ["name"],
    },
  },
  {
    name: "request_schedule_meeting",
    description:
      "Create schedule_meeting session + confirm gate. Does not auto-book calendar (stub).",
    inputSchema: {
      type: "object",
      properties: {
        peerEmail: { type: "string" },
        linkId: { type: "string" },
        durationMinutes: { type: "number" },
        windowStart: { type: "string" },
        windowEnd: { type: "string" },
        timezone: { type: "string" },
        title: { type: "string" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "list_confirms",
    description: "List confirm gates (human-gated by default).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "respond_confirm",
    description:
      "Record human decision on a confirm gate. Call only after human OK.",
    inputSchema: {
      type: "object",
      properties: {
        confirmId: { type: "string" },
        sessionId: { type: "string" },
        action: { type: "string", enum: ["approve", "decline", "defer"] },
        note: { type: "string" },
      },
      required: ["action"],
    },
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function textResult(data, isError = false) {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

async function api(path, { method = "GET", body } = {}) {
  if (!BASE || !KEY) {
    throw new Error(
      "Set HONEYMATCHA_BASE_URL and HONEYMATCHA_API_KEY (hm_...) before starting the MCP server.",
    );
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

async function remoteMcp(method, params = {}) {
  if (!BASE || !KEY) {
    throw new Error(
      "Set HONEYMATCHA_BASE_URL and HONEYMATCHA_API_KEY before starting the MCP server.",
    );
  }
  const id = `stdio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || data.error || `HTTP ${res.status}`);
  }
  return data.result;
}

async function callTool(name, args = {}) {
  switch (name) {
    case "whoami":
    case "health":
      return api("/api/v1/me");
    case "list_links":
      return api("/api/v1/links");
    case "create_invite":
      return api("/api/v1/links/invite", { method: "POST", body: args });
    case "accept_invite":
      return api("/api/v1/links/accept", { method: "POST", body: args });
    case "list_sessions":
      return api("/api/v1/sessions");
    case "post_board_message": {
      const { sessionId, kind, body } = args;
      return api(`/api/v1/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: "POST",
        body: { kind, body: body ?? {} },
      });
    }
    case "read_board":
      return api(
        `/api/v1/sessions/${encodeURIComponent(args.sessionId)}/board`,
      );
    case "list_intents": {
      const q = args.q ? `?q=${encodeURIComponent(args.q)}` : "";
      return api(`/api/v1/intents${q}`);
    }
    case "propose_intent":
      return api("/api/v1/intents/propose", { method: "POST", body: args });
    case "request_schedule_meeting":
      return api("/api/v1/schedule", { method: "POST", body: args });
    case "list_confirms":
      return api("/api/v1/confirms");
    case "respond_confirm":
      return api("/api/v1/confirms/respond", { method: "POST", body: args });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function handle(msg) {
  const { id, method, params } = msg;

  if (method === "initialize") {
    return send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: msg.params?.protocolVersion || "2026-07-28",
        capabilities: { tools: {} },
        serverInfo: { name: "honeymatcha", version: "0.3.0" },
        instructions:
          "HoneyMatcha MCP (stdio). Pair an agent in the human browser, then set HONEYMATCHA_BASE_URL + HONEYMATCHA_API_KEY. Tools are loaded from the remote server.",
      },
    });
  }

  if (method === "notifications/initialized" || method === "initialized") {
    return;
  }

  if (method === "ping") {
    return send({ jsonrpc: "2.0", id, result: {} });
  }

  if (method === "tools/list") {
    try {
      return send({
        jsonrpc: "2.0",
        id,
        result: await remoteMcp("tools/list"),
      });
    } catch (err) {
      return send({
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: err.message || "Remote MCP failed" },
      });
    }
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments ?? {};
    try {
      const result = await remoteMcp("tools/call", {
        name,
        arguments: args,
      });
      return send({ jsonrpc: "2.0", id, result });
    } catch (err) {
      return send({
        jsonrpc: "2.0",
        id,
        result: textResult(
          { error: err.message, details: err.data, status: err.status },
          true,
        ),
      });
    }
  }

  if (id !== undefined) {
    return send({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    send({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    return;
  }
  try {
    await handle(msg);
  } catch (err) {
    if (msg.id !== undefined) {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32603, message: err.message || "Internal error" },
      });
    }
  }
});

// Do not write logs to stdout (MCP uses stdout for JSON-RPC).
if (!BASE || !KEY) {
  console.error(
    "[honeymatcha-mcp] Warning: HONEYMATCHA_BASE_URL and HONEYMATCHA_API_KEY must be set for tool calls.",
  );
}
