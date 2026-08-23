import { randomBytes } from "crypto";
import { authenticateAgent } from "@/lib/agent-auth";
import { mcpConnectInstructions } from "@/lib/connect-copy";
import { PRODUCT_VERSION } from "@/lib/discovery";
import { requestBaseUrl } from "@/lib/http";
import {
  corsHeaders,
  isAllowedMcpOrigin,
  jsonCors,
  mcpMethodNotAllowed,
  mcpUnauthorized,
  optionsCors,
  withCors,
} from "@/lib/mcp-oauth";
import {
  dispatchMcpTool,
  getMcpTools,
  mcpToolError,
  mcpToolResult,
} from "@/lib/mcp-tools";
import {
  agentRateLimitKey,
  rateLimit,
  rateLimitedJson,
} from "@/lib/rate-limit";

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

function mcpAuth(request: Request) {
  const rate = rateLimit(agentRateLimitKey(request));
  if (!rate.ok) return withCors(rateLimitedJson(rate));
  return null;
}

function rejectInvalidOrigin(request: Request): Response | null {
  if (
    isAllowedMcpOrigin(
      request.headers.get("origin"),
      requestBaseUrl(request),
    )
  ) {
    return null;
  }
  return jsonCors(
    { error: "forbidden", error_description: "Origin is not allowed" },
    403,
  );
}

async function requireMcpAgent(request: Request) {
  const limited = mcpAuth(request);
  if (limited) return limited;
  const auth = await authenticateAgent(request);
  if (!auth) return mcpUnauthorized(requestBaseUrl(request));
  return auth;
}

export async function OPTIONS(request: Request) {
  const rejected = rejectInvalidOrigin(request);
  if (rejected) return rejected;
  return optionsCors();
}

/**
 * Streamable HTTP MCP JSON-RPC for remote agent clients.
 *
 * POST /api/mcp
 * Authorization: Bearer hm_...
 *
 * Supported methods: initialize, tools/list, tools/call, ping
 * Also accepts { tool, arguments } shortcut for tools/call.
 *
 * Unauthenticated POSTs return 401 + WWW-Authenticate so MCP clients start OAuth.
 * GET with Accept: text/event-stream returns 405: this server does not offer SSE.
 */
export async function POST(request: Request) {
  const rejected = rejectInvalidOrigin(request);
  if (rejected) return rejected;
  const auth = await requireMcpAgent(request);
  if (auth instanceof Response) return auth;

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
      return Response.json(mcpToolError(err, requestBaseUrl(request)), {
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
            instructions: mcpConnectInstructions(),
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
          return rpcResult(id, mcpToolError(err, requestBaseUrl(request)));
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

/**
 * Streamable HTTP clients probe GET for an SSE notification stream.
 * We do not offer one: 405 is the spec signal to continue with POST-only JSON.
 * Other GET Accept types return the tool catalog (auth required).
 */
export async function GET(request: Request) {
  const rejected = rejectInvalidOrigin(request);
  if (rejected) return rejected;
  const accept = (request.headers.get("accept") ?? "").toLowerCase();
  if (accept.includes("text/event-stream")) {
    return mcpMethodNotAllowed("POST, OPTIONS");
  }

  const auth = await requireMcpAgent(request);
  if (auth instanceof Response) return auth;

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

/** Session teardown is optional; Streamable HTTP clients accept 405. */
export async function DELETE(request: Request) {
  const rejected = rejectInvalidOrigin(request);
  if (rejected) return rejected;
  return mcpMethodNotAllowed("POST, GET, OPTIONS");
}
