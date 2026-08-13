import "dotenv/config";
import { randomBytes, randomUUID } from "crypto";
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

  console.log(
    JSON.stringify(
      {
        ok: true,
        pairedAgent: exchange.data.agentName,
        guestTask: publicId,
        guestResponses: organizerRead.data.responses.length,
        a2a: "SendMessage completed",
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
