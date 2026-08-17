import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "crypto";
import postgres from "postgres";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL required");
  process.exit(1);
}
const sql = postgres(databaseUrl, { max: 1 });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function jsonFetch(
  path,
  { method = "GET", bearer, guest, body, headers = {} } = {},
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(guest ? { Authorization: `Guest ${guest}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function main() {
  const suffix = randomBytes(4).toString("hex");
  const email = `organizer_${suffix}@example.com`;
  const [user] = await sql`
    insert into users (clerk_user_id, email, name)
    values (${`clerk_platform_${suffix}`}, ${email}, ${"Platform Organizer"})
    returning *
  `;

  const health = await jsonFetch("/api/v1/health");
  assert(health.response.ok, "health should be public");

  const card = await jsonFetch("/.well-known/agent-card.json");
  assert(
    card.data.supportedInterfaces?.[0]?.protocolVersion === "1.0",
    "A2A card should advertise v1",
  );

  const pairing = await jsonFetch("/api/v1/pairings/start", {
    method: "POST",
    body: { agentName: "Platform Test Agent" },
  });
  assert(pairing.response.status === 201, JSON.stringify(pairing.data));
  await sql`
    update agent_pairings
    set status = 'approved', user_id = ${user.id}, approved_at = now()
    where user_code = ${pairing.data.userCode}
  `;
  const exchange = await jsonFetch("/api/v1/pairings/token", {
    method: "POST",
    body: { deviceCode: pairing.data.deviceCode },
  });
  assert(exchange.response.ok, JSON.stringify(exchange.data));
  const token = exchange.data.accessToken;
  assert(String(token).startsWith("hm_"), "pairing must return hm_ credential");
  assert(
    !exchange.data.scopes.includes("approvals:write"),
    "paired agent must not approve for human",
  );

  const me = await jsonFetch("/api/v1/me", { bearer: token });
  assert(me.response.ok, JSON.stringify(me.data));
  assert(me.data.user.email === email, "paired credential should map to human");

  const forbiddenApproval = await jsonFetch("/api/v1/confirms/respond", {
    method: "POST",
    bearer: token,
    body: { confirmId: randomUUID(), action: "approve" },
  });
  assert(
    forbiddenApproval.response.status === 403,
    "default agent approval must be forbidden",
  );

  const guestTask = await jsonFetch("/api/v1/guest-tasks", {
    method: "POST",
    bearer: token,
    body: {
      taskType: "binary_choice",
      title: "Can you join Tuesday at 2pm?",
      description: "One private response for the interview coordinator.",
      targetEmail: "candidate@example.com",
      config: { choices: ["Yes", "No"] },
    },
  });
  assert(guestTask.response.status === 201, JSON.stringify(guestTask.data));
  const guestUrl = new URL(guestTask.data.guestUrl);
  const guestToken = guestUrl.hash.slice(1);
  const publicId = guestTask.data.task.publicId;
  assert(guestToken.startsWith("gt_"), "guest URL should carry gt_ fragment");

  const guestRead = await jsonFetch(`/api/guest/tasks/${publicId}`, {
    guest: guestToken,
  });
  assert(guestRead.response.ok, JSON.stringify(guestRead.data));
  assert(
    guestRead.data.task.title === "Can you join Tuesday at 2pm?",
    "guest should read only its task",
  );

  const idempotencyKey = randomUUID();
  const guestResponse = await jsonFetch(
    `/api/guest/tasks/${publicId}/respond`,
    {
      method: "POST",
      guest: guestToken,
      headers: { "Idempotency-Key": idempotencyKey },
      body: {
        email: "candidate@example.com",
        response: { choice: "Yes" },
      },
    },
  );
  assert(guestResponse.response.ok, JSON.stringify(guestResponse.data));
  const replay = await jsonFetch(`/api/guest/tasks/${publicId}/respond`, {
    method: "POST",
    guest: guestToken,
    headers: { "Idempotency-Key": idempotencyKey },
    body: {
      email: "candidate@example.com",
      response: { choice: "Yes" },
    },
  });
  assert(replay.data.idempotent === true, "guest replay should be idempotent");

  const organizerRead = await jsonFetch(
    `/api/v1/guest-tasks/${publicId}`,
    { bearer: token },
  );
  assert(
    organizerRead.data.responses?.length === 1,
    "organizer should see one guest response",
  );

  const hiringTask = await jsonFetch("/api/v1/guest-tasks", {
    method: "POST",
    bearer: token,
    body: {
      taskType: "hiring_compatibility",
      title: "Private role compatibility check",
      description: "Compare hard constraints before an introduction.",
      targetEmail: "candidate@example.com",
      privateConfig: {
        compensationMaximum: 180000,
        locations: ["New York"],
        workModes: ["Hybrid"],
        sponsorshipAvailable: true,
        latestStart: "2026-11-01",
        levels: ["Senior"],
      },
    },
  });
  assert(hiringTask.response.status === 201, JSON.stringify(hiringTask.data));
  const hiringUrl = new URL(hiringTask.data.guestUrl);
  const hiringToken = hiringUrl.hash.slice(1);
  const hiringPublicId = hiringTask.data.task.publicId;
  const hiringRead = await jsonFetch(`/api/guest/tasks/${hiringPublicId}`, {
    guest: hiringToken,
  });
  assert(hiringRead.response.ok, JSON.stringify(hiringRead.data));
  assert(
    hiringRead.data.task.privateConfig === undefined,
    "guest must never receive employer private constraints",
  );
  const hiringResponse = await jsonFetch(
    `/api/guest/tasks/${hiringPublicId}/respond`,
    {
      method: "POST",
      guest: hiringToken,
      headers: { "Idempotency-Key": randomUUID() },
      body: {
        email: "candidate@example.com",
        response: {
          compensationMinimum: 165000,
          locations: ["New York"],
          workModes: ["Hybrid"],
          sponsorshipRequired: true,
          earliestStart: "2026-10-01",
          levels: ["Senior"],
        },
      },
    },
  );
  assert(hiringResponse.response.ok, JSON.stringify(hiringResponse.data));
  const hiringOrganizerRead = await jsonFetch(
    `/api/v1/guest-tasks/${hiringPublicId}`,
    { bearer: token },
  );
  const publicMatch = hiringOrganizerRead.data.responses?.[0]?.response;
  assert(publicMatch?.verdict === "compatible", "hiring match should be compatible");
  assert(
    publicMatch?.compensationMinimum === undefined,
    "organizer must not receive candidate raw constraints",
  );
  const [storedHiring] = await sql`
    select gr.private_response, gr.response
    from guest_responses gr
    join guest_tasks gt on gt.id = gr.guest_task_id
    where gt.public_id = ${hiringPublicId}
  `;
  assert(
    String(storedHiring.private_response).startsWith("enc:v1:"),
    "candidate constraints must be encrypted at rest",
  );

  const a2a = await jsonFetch("/api/a2a", {
    method: "POST",
    bearer: token,
    headers: { "A2A-Version": "1.0" },
    body: {
      jsonrpc: "2.0",
      id: "platform-test",
      method: "SendMessage",
      params: {
        message: {
          messageId: randomUUID(),
          role: "ROLE_USER",
          parts: [{ data: { tool: "list_intents", arguments: {} } }],
        },
      },
    },
  });
  assert(a2a.response.ok && a2a.data.result?.message, JSON.stringify(a2a.data));

  const unauthMcp = await jsonFetch("/api/mcp", {
    method: "POST",
    body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
  });
  assert(unauthMcp.response.status === 401, "MCP without Bearer must 401");
  const wwwAuth = unauthMcp.response.headers.get("www-authenticate") ?? "";
  assert(
    wwwAuth.includes("oauth-protected-resource"),
    `expected resource_metadata challenge, got ${wwwAuth}`,
  );

  const protectedResource = await jsonFetch(
    "/.well-known/oauth-protected-resource",
  );
  assert(protectedResource.response.ok, JSON.stringify(protectedResource.data));
  assert(
    Array.isArray(protectedResource.data.authorization_servers) &&
      protectedResource.data.authorization_servers.length > 0,
    "authorization_servers must be set for MCP OAuth",
  );

  const asMeta = await jsonFetch("/.well-known/oauth-authorization-server");
  assert(asMeta.response.ok, JSON.stringify(asMeta.data));
  assert(asMeta.data.token_endpoint?.includes("/oauth/token"));

  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const redirectUri = "https://www.cursor.com/agents/mcp/oauth/callback";

  const registered = await jsonFetch("/oauth/register", {
    method: "POST",
    body: {
      client_name: "Platform Test MCP",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
    },
  });
  assert(registered.response.status === 201, JSON.stringify(registered.data));
  const clientId = registered.data.client_id;
  assert(String(clientId).startsWith("hmc_"), "DCR must return hmc_ client_id");

  const rejected = await jsonFetch("/oauth/register", {
    method: "POST",
    body: {
      client_name: "Evil",
      redirect_uris: ["https://evil.example/callback"],
    },
  });
  assert(rejected.response.status === 400, "non-allowlisted redirect must fail");

  const authCode = `hac_${randomBytes(24).toString("base64url")}`;
  const codeHash = createHash("sha256").update(authCode).digest("hex");
  await sql`
    insert into oauth_authorization_codes (
      code_hash, client_id, user_id, redirect_uri, code_challenge,
      code_challenge_method, scopes, agent_name, expires_at
    ) values (
      ${codeHash},
      ${clientId},
      ${user.id},
      ${redirectUri},
      ${codeChallenge},
      ${"S256"},
      ${sql.json(["profile:read", "tasks:read", "tasks:write", "people:read", "people:write", "approvals:read", "guest_tasks:read", "guest_tasks:write", "intents:read", "intents:request", "discovery:read", "discovery:write"])},
      ${"Platform OAuth Agent"},
      ${new Date(Date.now() + 10 * 60 * 1000)}
    )
  `;

  const tokenRes = await jsonFetch("/oauth/token", {
    method: "POST",
    body: {
      grant_type: "authorization_code",
      code: authCode,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    },
  });
  assert(tokenRes.response.ok, JSON.stringify(tokenRes.data));
  const oauthToken = tokenRes.data.access_token;
  assert(String(oauthToken).startsWith("hm_"), "OAuth must mint hm_ access token");
  assert(
    !String(tokenRes.data.scope ?? "").includes("approvals:write"),
    "OAuth scopes must exclude approvals:write",
  );

  const mcpList = await jsonFetch("/api/mcp", {
    method: "POST",
    bearer: oauthToken,
    body: { jsonrpc: "2.0", id: 2, method: "tools/list" },
  });
  assert(mcpList.response.ok, JSON.stringify(mcpList.data));
  assert(
    Array.isArray(mcpList.data.result?.tools) &&
      mcpList.data.result.tools.some((t) => t.name === "get_inbox"),
    "OAuth token must list MCP tools including get_inbox",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        pairedAgent: exchange.data.agentName,
        guestTask: publicId,
        guestResponses: organizerRead.data.responses.length,
        hiringCompatibility: publicMatch.verdict,
        a2a: "SendMessage completed",
        mcpOAuth: "DCR + PKCE token + tools/list",
      },
      null,
      2,
    ),
  );

  await sql`delete from users where id = ${user.id}`;
  await sql.end();
}

main().catch(async (error) => {
  console.error(error);
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
});
