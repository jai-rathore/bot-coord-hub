/**
 * MCP tool catalog + dispatcher for HoneyMatcha.
 * Used by POST /api/mcp (JSON-RPC) and documented for the stdio MCP entry.
 */

import type { AgentAuth } from "@/lib/agent-auth";
import {
  acceptInvite,
  AgentApiError,
  createInvite,
  listConfirms,
  listIntents,
  listLinks,
  listSessions,
  postBoardMessage,
  proposeIntent,
  readBoard,
  requestScheduleMeeting,
  respondConfirm,
  whoami,
} from "@/lib/agent-api";

export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: "whoami",
    description:
      "Health check for the HoneyMatcha API key. Returns the authenticated user and key metadata.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "list_links",
    description:
      "List peer links (pending/active/revoked) for the authenticated user.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "create_invite",
    description:
      "Create a peer invite handshake URL. Share inviteUrl/inviteCode with a friend’s bot/human so they can accept. Optional per-link policies: confirmRequired, timezone, allowedHours.",
    inputSchema: {
      type: "object",
      properties: {
        toEmail: {
          type: "string",
          description:
            "Optional peer email. Omit for an open invite URL anyone signed-in can accept.",
        },
        toName: { type: "string", description: "Optional peer display name" },
        scopes: {
          type: "array",
          items: { type: "string" },
          description:
            'Optional scopes (default: ["schedule_meeting","avail.read_freebusy"])',
        },
        confirmRequired: {
          type: "boolean",
          description: "Require human confirms before booking (default true)",
        },
        timezone: {
          type: "string",
          description: "IANA timezone for allowedHours evaluation",
        },
        allowedHours: {
          type: "object",
          description: '{ start: "09:00", end: "17:00", days?: number[] }',
          additionalProperties: true,
        },
      },
    },
  },
  {
    name: "accept_invite",
    description: "Accept a peer invite by inviteCode.",
    inputSchema: {
      type: "object",
      properties: {
        inviteCode: { type: "string" },
      },
      required: ["inviteCode"],
    },
  },
  {
    name: "list_sessions",
    description: "List coordination sessions the authenticated user participates in.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "post_board_message",
    description:
      "Post a message to a session board (e.g. avail.offer, proposal, note).",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        kind: {
          type: "string",
          description: "Message kind, e.g. avail.offer, note, proposal",
        },
        body: {
          type: "object",
          description: "JSON payload for the board message",
          additionalProperties: true,
        },
      },
      required: ["sessionId", "kind"],
    },
  },
  {
    name: "read_board",
    description: "Read a session and its board messages.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "list_intents",
    description: "List live intents available for agent discovery.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Optional search query" },
      },
    },
  },
  {
    name: "propose_intent",
    description: "Propose a new intent type for the registry (deduped).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        slug: { type: "string" },
        description: { type: "string" },
        force: {
          type: "boolean",
          description: "Force create despite similar matches",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "request_schedule_meeting",
    description:
      "Start schedule_meeting with linked peers: free/busy propose → human confirm gate → CalendarPort book (Mock or Google + Meet). Use peerEmails for 3+ participants.",
    inputSchema: {
      type: "object",
      properties: {
        peerEmail: { type: "string" },
        peerEmails: {
          type: "array",
          items: { type: "string" },
          description: "Group coordination — 2+ peer emails (organizer implied)",
        },
        linkId: { type: "string" },
        durationMinutes: { type: "number" },
        windowStart: { type: "string", description: "ISO datetime" },
        windowEnd: { type: "string", description: "ISO datetime" },
        timezone: { type: "string" },
        title: { type: "string" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "list_confirms",
    description:
      "List confirm gates for the authenticated user. Human-gated by default — see /app/confirm.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "respond_confirm",
    description:
      "Record a human decision on a confirm gate (approve|decline|defer). Call only after explicit human OK. When all schedule_meeting participants approve, books via CalendarPort (Meet when Google connected).",
    inputSchema: {
      type: "object",
      properties: {
        confirmId: { type: "string" },
        sessionId: { type: "string" },
        action: {
          type: "string",
          enum: ["approve", "decline", "defer"],
        },
        note: { type: "string" },
      },
      required: ["action"],
    },
  },
];

function baseUrlFromRequest(request?: Request): string | undefined {
  if (!request) return undefined;
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export async function dispatchMcpTool(
  auth: AgentAuth,
  name: string,
  args: Record<string, unknown> = {},
  request?: Request,
): Promise<unknown> {
  const baseUrl = baseUrlFromRequest(request);

  switch (name) {
    case "whoami":
    case "health":
      return whoami(auth);
    case "list_links":
      return listLinks(auth, baseUrl);
    case "create_invite":
      return createInvite(
        auth,
        {
          toEmail: args.toEmail as string | undefined,
          toName: args.toName as string | undefined,
          scopes: args.scopes as string[] | undefined,
          confirmRequired: args.confirmRequired as boolean | undefined,
          timezone: args.timezone as string | undefined,
          allowedHours: args.allowedHours as
            | { start: string; end: string; days?: number[] }
            | undefined,
        },
        baseUrl,
      );
    case "accept_invite":
      return acceptInvite(
        auth,
        { inviteCode: args.inviteCode as string | undefined },
        baseUrl,
      );
    case "list_sessions":
      return listSessions(auth);
    case "post_board_message":
      return postBoardMessage(auth, String(args.sessionId ?? ""), {
        kind: args.kind as string | undefined,
        body: (args.body as Record<string, unknown> | undefined) ?? {},
      });
    case "read_board":
      return readBoard(auth, String(args.sessionId ?? ""));
    case "list_intents":
      return listIntents(args.q as string | undefined);
    case "propose_intent":
      return proposeIntent(auth, {
        name: args.name as string | undefined,
        slug: args.slug as string | undefined,
        description: args.description as string | undefined,
        force: Boolean(args.force),
      });
    case "request_schedule_meeting":
      return requestScheduleMeeting(auth, {
        peerEmail: args.peerEmail as string | undefined,
        peerEmails: args.peerEmails as string[] | undefined,
        linkId: args.linkId as string | undefined,
        durationMinutes: args.durationMinutes as number | undefined,
        windowStart: args.windowStart as string | undefined,
        windowEnd: args.windowEnd as string | undefined,
        timezone: args.timezone as string | undefined,
        title: args.title as string | undefined,
        notes: args.notes as string | undefined,
      });
    case "list_confirms":
      return listConfirms(auth);
    case "respond_confirm":
      return respondConfirm(auth, {
        confirmId: args.confirmId as string | undefined,
        sessionId: args.sessionId as string | undefined,
        action: args.action as string | undefined,
        note: args.note as string | undefined,
      });
    default:
      throw new AgentApiError(404, `Unknown tool: ${name}`);
  }
}

export function mcpToolResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data,
  };
}

export function mcpToolError(err: unknown) {
  if (err instanceof AgentApiError) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { error: err.message, details: err.details, status: err.status },
            null,
            2,
          ),
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}
