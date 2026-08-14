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
let cleanupUserIds = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function keyMaterial() {
  const raw = `hm_${randomBytes(24).toString("base64url")}`;
  return {
    raw,
    prefix: raw.slice(0, 11),
    hash: createHash("sha256").update(raw).digest("hex"),
  };
}

async function jsonFetch(path, { method = "GET", bearer, body, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function main() {
  const suffix = randomBytes(4).toString("hex");
  const seekerKey = keyMaterial();
  const hostKey = keyMaterial();
  const [seeker, host] = await sql`
    insert into users (clerk_user_id, email, name)
    values
      (${`clerk_discovery_api_seeker_${suffix}`}, ${`api-seeker-${suffix}@example.com`}, ${"API Seeker"}),
      (${`clerk_discovery_api_host_${suffix}`}, ${`api-host-${suffix}@example.com`}, ${"API Host"})
    returning *
  `;
  cleanupUserIds = [seeker.id, host.id];
  await sql`
    insert into api_keys (user_id, name, key_prefix, key_hash, scopes)
    values
      (
        ${seeker.id},
        ${"Discovery API seeker"},
        ${seekerKey.prefix},
        ${seekerKey.hash},
        ${sql.json([
          "profile:read",
          "tasks:read",
          "discovery:read",
          "discovery:write",
          "approvals:write",
        ])}
      ),
      (
        ${host.id},
        ${"Discovery API host"},
        ${hostKey.prefix},
        ${hostKey.hash},
        ${sql.json([
          "profile:read",
          "discovery:read",
          "discovery:write",
          "approvals:write",
        ])}
      )
  `;

  const catalog = await jsonFetch("/api/v1/discovery/catalog", {
    bearer: seekerKey.raw,
  });
  assert(catalog.response.ok, JSON.stringify(catalog.data));
  assert(
    catalog.data.intents.some((intent) => intent.slug === "local_meetup"),
    "catalog should advertise local_meetup",
  );

  const capability = await jsonFetch("/api/v1/me/capabilities", {
    method: "PUT",
    bearer: seekerKey.raw,
    body: {
      supportedIntents: { local_meetup: 1, hiring_compatibility: 1 },
      platforms: ["e2e-api"],
    },
  });
  assert(capability.response.ok, JSON.stringify(capability.data));
  const hostCapability = await jsonFetch("/api/v1/me/capabilities", {
    method: "PUT",
    bearer: hostKey.raw,
    body: {
      supportedIntents: { local_meetup: 1 },
      platforms: ["e2e-api"],
    },
  });
  assert(hostCapability.response.ok, JSON.stringify(hostCapability.data));

  const commonLocation = {
    label: "Park Slope",
    countryCode: "US",
    region: "NY",
    locality: "Brooklyn",
    neighborhood: "Park Slope",
    granularity: "neighborhood",
    visibility: "private_match",
  };
  const seekerEnrollment = await jsonFetch(
    "/api/v1/discovery/enrollments",
    {
      method: "POST",
      bearer: seekerKey.raw,
      body: {
        intentSlug: "local_meetup",
        claims: {
          participantType: "attendee",
          interests: ["coffee", "board games"],
          timeWindows: ["saturday afternoon"],
          introductionSummary: "Interested in a friendly neighborhood group.",
        },
        provenance: {
          participantType: { source: "human conversation" },
          interests: { source: "human conversation" },
          timeWindows: { source: "human conversation" },
          introductionSummary: { source: "human conversation" },
        },
        location: commonLocation,
        requestActivation: true,
      },
    },
  );
  assert(seekerEnrollment.response.status === 201, JSON.stringify(seekerEnrollment.data));
  assert(
    seekerEnrollment.data.enrollment.status === "pending_approval",
    "agent enrollment must wait for human approval",
  );
  const hostEnrollment = await jsonFetch("/api/v1/discovery/enrollments", {
    method: "POST",
    bearer: hostKey.raw,
    body: {
      intentSlug: "local_meetup",
      claims: {
        participantType: "host",
        interests: ["board games", "tea"],
        timeWindows: ["saturday afternoon"],
        introductionSummary: "Hosts small monthly game afternoons.",
      },
      provenance: {
        participantType: { source: "human conversation" },
        interests: { source: "human conversation" },
        timeWindows: { source: "human conversation" },
        introductionSummary: { source: "human conversation" },
      },
      location: commonLocation,
      requestActivation: true,
    },
  });
  assert(hostEnrollment.response.status === 201, JSON.stringify(hostEnrollment.data));
  await sql`
    update purpose_enrollments
    set status = 'active', consented_at = now()
    where id in (
      ${seekerEnrollment.data.enrollment.id},
      ${hostEnrollment.data.enrollment.id}
    )
  `;

  const search = await jsonFetch("/api/v1/discovery/search", {
    method: "POST",
    bearer: seekerKey.raw,
    body: { intentSlug: "local_meetup" },
  });
  assert(search.response.ok, JSON.stringify(search.data));
  assert(search.data.candidates.length === 1, "one anonymous candidate expected");
  const candidate = search.data.candidates[0];
  assert(String(candidate.candidateHandle).startsWith("dc_"), "opaque handle expected");
  assert(candidate.compatibility.verdict === "potential", "search must not expose private matching");
  const serializedCandidate = JSON.stringify(candidate);
  assert(!serializedCandidate.includes(host.id), "candidate user id leaked");
  assert(!serializedCandidate.includes(host.email), "candidate email leaked");
  assert(!serializedCandidate.includes("board games"), "private interests leaked");

  const request = await jsonFetch("/api/v1/discovery/interests", {
    method: "POST",
    bearer: seekerKey.raw,
    headers: { "idempotency-key": randomUUID() },
    body: { candidateHandle: candidate.candidateHandle },
  });
  assert(request.response.status === 201, JSON.stringify(request.data));
  assert(request.data.interestId === null, "agent response leaked stable interest id");
  const [storedInterest] = await sql`
    select id
    from discovery_interests
    where requester_user_id = ${seeker.id}
      and recipient_user_id = ${host.id}
  `;
  const interestId = storedInterest.id;
  const reciprocalSearch = await jsonFetch("/api/v1/discovery/search", {
    method: "POST",
    bearer: hostKey.raw,
    body: { intentSlug: "local_meetup" },
  });
  assert(reciprocalSearch.response.ok, JSON.stringify(reciprocalSearch.data));
  const reciprocalRequest = await jsonFetch("/api/v1/discovery/interests", {
    method: "POST",
    bearer: hostKey.raw,
    body: {
      candidateHandle:
        reciprocalSearch.data.candidates[0].candidateHandle,
    },
  });
  assert(reciprocalRequest.response.status === 201, JSON.stringify(reciprocalRequest.data));
  assert(
    reciprocalRequest.data.interestId === null,
    "reciprocal request leaked stable interest linkage",
  );
  const [pairCount] = await sql`
    select count(*)::int as count
    from discovery_interests
    where pair_key = ${[seeker.id, host.id].sort().join(":")}
  `;
  assert(pairCount.count === 1, "reciprocal request created a duplicate interest");

  const hiddenPending = await jsonFetch("/api/v1/discovery/interests", {
    bearer: hostKey.raw,
  });
  assert(hiddenPending.response.ok, JSON.stringify(hiddenPending.data));
  assert(
    hiddenPending.data.interests.length === 0,
    "recipient must not see an unapproved requester draft",
  );
  const requesterApproval = await jsonFetch(
    `/api/v1/discovery/interests/${interestId}/decision`,
    {
      method: "POST",
      bearer: seekerKey.raw,
      body: { decision: "confirm_request" },
    },
  );
  assert(
    requesterApproval.response.status === 403 &&
      requesterApproval.data.code === "human_approval_required",
    "agents must not confirm outgoing discovery requests",
  );
  await sql`
    update discovery_interests
    set requester_confirmed_at = now()
    where id = ${interestId}
  `;
  const pending = await jsonFetch("/api/v1/discovery/interests", {
    bearer: hostKey.raw,
  });
  assert(pending.response.ok, JSON.stringify(pending.data));
  assert(pending.data.interests[0].disclosure === null, "one-sided interest leaked");
  assert(pending.data.interests[0].id === null, "agent interest list leaked stable id");
  await sql`
    delete from agent_capabilities
    where api_key_id = (
      select id from api_keys where key_hash = ${hostKey.hash}
    )
  `;
  const undeclaredList = await jsonFetch("/api/v1/discovery/interests", {
    bearer: hostKey.raw,
  });
  assert(
    undeclaredList.response.ok && undeclaredList.data.interests.length === 0,
    "undeclared agent consumed contract-bound discovery data",
  );

  const accepted = await jsonFetch(
    `/api/v1/discovery/interests/${interestId}/decision`,
    {
      method: "POST",
      bearer: hostKey.raw,
      body: { decision: "accept" },
    },
  );
  assert(
    accepted.response.status === 403 &&
      accepted.data.code === "human_approval_required",
    "agents must not accept discovery introductions",
  );

  const mcp = await jsonFetch("/api/mcp", {
    method: "POST",
    bearer: seekerKey.raw,
    body: { tool: "list_discovery_capabilities", arguments: {} },
  });
  assert(mcp.response.ok, JSON.stringify(mcp.data));
  assert(
    JSON.stringify(mcp.data).includes("local_meetup"),
    "MCP should expose discovery catalog",
  );

  const a2a = await jsonFetch("/api/a2a", {
    method: "POST",
    bearer: seekerKey.raw,
    headers: { "A2A-Version": "1.0" },
    body: {
      jsonrpc: "2.0",
      id: "discovery-api-test",
      method: "SendMessage",
      params: {
        message: {
          messageId: randomUUID(),
          role: "ROLE_USER",
          parts: [
            {
              data: {
                tool: "list_discovery_interests",
                arguments: {},
              },
            },
          ],
        },
      },
    },
  });
  assert(a2a.response.ok && a2a.data.result?.message, JSON.stringify(a2a.data));

  const blocked = await jsonFetch(
    `/api/v1/discovery/interests/${interestId}/safety`,
    {
      method: "POST",
      bearer: seekerKey.raw,
      body: { action: "block", reasonCode: "e2e_complete" },
    },
  );
  assert(
    blocked.response.status === 403 &&
      blocked.data.code === "human_approval_required",
    "agents must not perform discovery safety decisions",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        catalog: "local_meetup",
        enrollment: "human approval required",
        candidate: "opaque",
        introduction: "human-only decisions enforced",
        disclosure: "not released to agents",
        mcp: "discovery catalog available",
        a2a: "discovery interests available",
        safety: "human-only boundary enforced",
      },
      null,
      2,
    ),
  );
  await sql`delete from users where id in (${seeker.id}, ${host.id})`;
  cleanupUserIds = [];
  await sql.end();
}

main().catch(async (error) => {
  console.error(error);
  for (const userId of cleanupUserIds) {
    await sql`delete from users where id = ${userId}`.catch(() => {});
  }
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
});
