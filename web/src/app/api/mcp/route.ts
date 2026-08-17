import { randomBytes } from "crypto";
import { PRODUCT_VERSION } from "@/lib/discovery";
import { requireAgent } from "@/lib/http";
import {
  corsHeaders,
  jsonCors,
  optionsCors,
} from "@/lib/mcp-oauth";
import {
  dispatchMcpTool,
  getMcpTools,
  mcpToolError,
  mcpToolResult,
} from "@/lib/mcp-tools";

export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2025-03-26";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

function rpcResult(
  id: JsonRpcId,
  result: unknown,
  extraHeaders?: HeadersInit,
) {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, result },
    { headers: { ...corsHeaders(), ...(extraHeaders ?? {}) } },
  );
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
) {
  return Response.json(
    {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code, message, data },
    },
    { headers: corsHeaders() },
  );
}

function newSessionId(): string {
  return `hm_${randomBytes(16).toString("hex")}`;
}

export async function OPTIONS() {
  return optionsCors();
}

/**
 * Streamable HTTP-compatible MCP JSON-RPC for remote agents (Grok Bot, Cursor).
 *
 * POST /api/mcp
 * Authorization: Bearer hm_...
 *
 * Supported methods: initialize, tools/list, tools/call, ping
 * Also accepts { tool, arguments } shortcut for tools/call.
 *
 * Unauthenticated requests return 401 + WWW-Authenticate so MCP clients start OAuth.
 */
export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) {
    const headers = new Headers(auth.headers);
    for (const [key, value] of Object.entries(corsHeaders())) {
      headers.set(key, value);
    }
    return new Response(auth.body, { status: auth.status, headers });
  }

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const id = body.id ?? null;
  const incomingSession = request.headers.get("mcp-session-id");

  // Shortcut: { tool: "whoami", arguments: {} }
  if (typeof (body as { tool?: string }).tool === "string") {
    const tool = (body as { tool: string }).tool;
    const args =
      ((body as { arguments?: Record<string, unknown> }).arguments as
        | Record<string, unknown>
        | undefined) ?? {};
    try {
      const data = await dispatchMcpTool(auth, tool, args, request);
      return Response.json(
        { ok: true, tool, result: data },
        { headers: corsHeaders() },
      );
    } catch (err) {
      return Response.json(mcpToolError(err), {
        status: 400,
        headers: corsHeaders(),
      });
    }
  }

  const method = body.method;
  if (!method) {
    return rpcError(id, -32600, "Invalid Request: method required");
  }

  try {
    switch (method) {
      case "initialize": {
        const sessionId = incomingSession || newSessionId();
        return rpcResult(
          id,
          {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: {
              name: "honeymatcha",
              version: PRODUCT_VERSION,
            },
            instructions:
              "HoneyMatcha MCP. Call get_inbox at the start of every turn. That is how this platform reaches you when someone else's agent starts a task with your human. If inbox.pending > 0, handle that work before anything else. Never book Google Calendar yourself.",
          },
          { "Mcp-Session-Id": sessionId },
        );
      }
      case "notifications/initialized":
      case "initialized":
        return new Response(null, {
          status: 204,
          headers: corsHeaders(),
        });
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: getMcpTools() });
      case "tools/call": {
        const params = body.params ?? {};
        const name = String(params.name ?? "");
        const args = (params.arguments as Record<string, unknown>) ?? {};
        if (!name) {
          return rpcError(id, -32602, "tools/call requires params.name");
        }
        try {
          const data = await dispatchMcpTool(auth, name, args, request);
          return rpcResult(id, mcpToolResult(data));
        } catch (err) {
          return rpcResult(id, mcpToolError(err));
        }
      }
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    console.error("[mcp] unexpected RPC error", err);
    return rpcError(id, -32603, "Internal error");
  }
}

/** GET returns tool catalog (discovery helper). Auth required. */
export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) {
    const headers = new Headers(auth.headers);
    for (const [key, value] of Object.entries(corsHeaders())) {
      headers.set(key, value);
    }
    return new Response(auth.body, { status: auth.status, headers });
  }

  return jsonCors({
    ok: true,
    server: "honeymatcha",
    version: PRODUCT_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    tools: getMcpTools(),
    usage: {
      jsonrpc: 'POST { "jsonrpc":"2.0","id":1,"method":"tools/list" }',
      call: 'POST { "jsonrpc":"2.0","id":2,"method":"tools/call","params":{ "name":"whoami","arguments":{} } }',
      shortcut: 'POST { "tool":"list_intents","arguments":{} }',
    },
  });
}
