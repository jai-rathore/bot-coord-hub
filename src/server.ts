/**
 * HTTP server — Bot Coord Hub API
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ABOUT_JSON, prefersJson, renderAboutHtml } from "./about.js";
import { authenticate } from "./auth.js";
import { FAVICON_SVG } from "./favicon.js";
import {
  getQuery,
  readJson,
  sendError,
  sendHtml,
  sendJson,
  sendSvg,
} from "./http.js";
import { loadStore } from "./store.js";
import {
  HttpError,
  acceptInvite,
  ackInbox,
  agentConfirm,
  agentPending,
  agentPropose,
  agentRespond,
  agentSchedule,
  createInvite,
  getHealth,
  getInbox,
  getSession,
  listLinks,
  postSessionMessage,
  revokeLink,
  startSession,
} from "./service.js";

const DEFAULT_PORT = 8787;

function baseUrlFrom(req: IncomingMessage, port: number): string {
  const host = req.headers.host ?? `localhost:${port}`;
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
  return `${proto}://${host}`;
}

function requireAuth(req: IncomingMessage) {
  const data = loadStore();
  const auth = authenticate(data, req.headers.authorization);
  if (!auth) {
    throw new HttpError(401, "unauthorized", "Missing or invalid Bearer API key");
  }
  return auth;
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  port: number
): Promise<void> {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  try {
    // Public about / landing (no auth)
    if (method === "GET" && path === "/") {
      const accept = req.headers.accept;
      if (prefersJson(typeof accept === "string" ? accept : undefined)) {
        sendJson(res, 200, ABOUT_JSON);
        return;
      }
      sendHtml(res, 200, renderAboutHtml());
      return;
    }

    // Public
    if (method === "GET" && path === "/health") {
      sendJson(res, 200, getHealth());
      return;
    }

    // Public favicon (browsers request without Authorization)
    if (
      method === "GET" &&
      (path === "/favicon.svg" || path === "/favicon.ico")
    ) {
      sendSvg(res, 200, FAVICON_SVG);
      return;
    }

    // Invite landing stub (for inviteUrl)
    if (method === "GET" && path.startsWith("/invite/")) {
      const code = path.slice("/invite/".length);
      sendJson(res, 200, {
        inviteCode: code,
        message:
          "Open this invite in HoneyMatcha or POST /v1/links/accept with your API key.",
        acceptEndpoint: "/v1/links/accept",
      });
      return;
    }

    const auth = requireAuth(req);
    const baseUrl = baseUrlFrom(req, port);

    // Links
    if (method === "POST" && path === "/v1/links/invite") {
      const body = (await readJson(req)) as Parameters<typeof createInvite>[1];
      sendJson(res, 201, createInvite(auth, body, baseUrl));
      return;
    }
    if (method === "POST" && path === "/v1/links/accept") {
      const body = (await readJson(req)) as Parameters<typeof acceptInvite>[1];
      sendJson(res, 200, acceptInvite(auth, body, baseUrl));
      return;
    }
    if (method === "POST" && path === "/v1/links/revoke") {
      const body = (await readJson(req)) as Parameters<typeof revokeLink>[1];
      sendJson(res, 200, revokeLink(auth, body));
      return;
    }
    if (method === "GET" && path === "/v1/links") {
      const q = getQuery(url);
      sendJson(res, 200, { links: listLinks(auth, q.userId, baseUrl) });
      return;
    }

    // Sessions
    if (method === "POST" && path === "/v1/sessions") {
      const body = (await readJson(req)) as Parameters<typeof startSession>[1];
      sendJson(res, 201, startSession(auth, body));
      return;
    }

    const sessionMsg = /^\/v1\/sessions\/([^/]+)\/messages$/.exec(path);
    if (method === "POST" && sessionMsg) {
      const body = (await readJson(req)) as Parameters<typeof postSessionMessage>[2];
      sendJson(res, 200, postSessionMessage(auth, sessionMsg[1]!, body));
      return;
    }

    const sessionGet = /^\/v1\/sessions\/([^/]+)$/.exec(path);
    if (method === "GET" && sessionGet) {
      sendJson(res, 200, getSession(auth, sessionGet[1]!));
      return;
    }

    // Inbox
    if (method === "GET" && path === "/v1/inbox") {
      const q = getQuery(url);
      sendJson(res, 200, { messages: getInbox(auth, q.agentId) });
      return;
    }
    const inboxAck = /^\/v1\/inbox\/([^/]+)\/ack$/.exec(path);
    if (method === "POST" && inboxAck) {
      sendJson(res, 200, ackInbox(auth, inboxAck[1]!));
      return;
    }

    // Agent shortcuts
    if (method === "POST" && path === "/v1/agent/schedule") {
      const body = (await readJson(req)) as Parameters<typeof agentSchedule>[1];
      sendJson(res, 201, agentSchedule(auth, body));
      return;
    }
    if (method === "POST" && path === "/v1/agent/respond") {
      const body = (await readJson(req)) as Parameters<typeof agentRespond>[1];
      sendJson(res, 200, agentRespond(auth, body));
      return;
    }
    if (method === "POST" && path === "/v1/agent/propose") {
      const body = (await readJson(req)) as Parameters<typeof agentPropose>[1];
      sendJson(res, 200, agentPropose(auth, body));
      return;
    }
    if (method === "POST" && path === "/v1/agent/confirm") {
      const body = (await readJson(req)) as Parameters<typeof agentConfirm>[1];
      sendJson(res, 200, agentConfirm(auth, body));
      return;
    }
    if (method === "GET" && path === "/v1/agent/pending") {
      sendJson(res, 200, agentPending(auth));
      return;
    }

    // Me
    if (method === "GET" && path === "/v1/me") {
      sendJson(res, 200, {
        userId: auth.userId,
        agentId: auth.agentId,
        label: auth.label,
      });
      return;
    }

    sendError(res, 404, "not_found", `No route ${method} ${path}`);
  } catch (e) {
    if (e instanceof HttpError) {
      sendError(res, e.status, e.code, e.message, e.details);
      return;
    }
    if (e instanceof SyntaxError) {
      sendError(res, 400, "invalid_payload", "Malformed JSON body");
      return;
    }
    console.error(e);
    sendError(
      res,
      500,
      "internal",
      e instanceof Error ? e.message : "Internal error"
    );
  }
}

export function startServer(port = DEFAULT_PORT): ReturnType<typeof createServer> {
  // Ensure store seeded on boot
  loadStore();

  const server = createServer((req, res) => {
    void handle(req, res, port);
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`bot-coord-hub listening on http://0.0.0.0:${port}`);
    console.log(`about: GET /`);
    console.log(`health: GET /health`);
    console.log(`seed keys: bc_jai_dev_key, bc_rishav_dev_key`);
  });

  return server;
}

export { DEFAULT_PORT };
