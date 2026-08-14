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

  const request = await jsonFetch("/api/v1/discovery/interests", {
    method: "POST",
    bearer: seekerKey.raw,
    headers: { "idempotency-key": randomUUID() },
    body: { candidateHandle: candidate.candidateHandle },
  });
  assert(request.response.status === 201, JSON.stringify(request.data));

  const pending = await jsonFetch("/api/v1/discovery/interests", {
    bearer: hostKey.raw,
  });
  assert(pending.response.ok, JSON.stringify(pending.data));
  assert(pending.data.interests[0].disclosure === null, "one-sided interest leaked");

  const accepted = await jsonFetch(
    `/api/v1/discovery/interests/${request.data.interestId}/decision`,
    {
      method: "POST",
      bearer: hostKey.raw,
      body: { decision: "accept" },
    },
  );
  assert(accepted.response.ok, JSON.stringify(accepted.data));
  assert(accepted.data.status === "accepted", "introduction was not accepted");
  assert(accepted.data.sessionId, "meetup should hand off to a session");
  assert(accepted.data.disclosure === null, "decision response must not copy disclosure");
  const authorizedInterests = await jsonFetch("/api/v1/discovery/interests", {
    bearer: hostKey.raw,
  });
  const authorizedDisclosure = authorizedInterests.data.interests.find(
    (interest) => interest.id === request.data.interestId,
  )?.disclosure;
  assert(authorizedDisclosure, "authorized disclosure should be readable by polling");
  assert(
    !JSON.stringify(authorizedDisclosure).includes(seeker.email),
    "email must not be disclosed",
  );
  const sessionList = await jsonFetch("/api/v1/sessions", {
    bearer: seekerKey.raw,
  });
  assert(sessionList.response.ok, JSON.stringify(sessionList.data));
  const publicMeetup = sessionList.data.sessions.find(
    (session) => session.id === accepted.data.sessionId,
  );
  assert(publicMeetup?.peer === null, "discovery session peer identity leaked");
  assert(publicMeetup?.peerUserId === null, "discovery session peer id leaked");
  assert(!JSON.stringify(publicMeetup).includes(host.id), "stable host id leaked");
  assert(!JSON.stringify(publicMeetup).includes(host.email), "host email leaked");

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
    `/api/v1/discovery/interests/${request.data.interestId}/safety`,
    {
      method: "POST",
      bearer: seekerKey.raw,
      body: { action: "block", reasonCode: "e2e_complete" },
    },
  );
  assert(blocked.response.ok, JSON.stringify(blocked.data));

  console.log(
    JSON.stringify(
      {
        ok: true,
        catalog: "local_meetup",
        enrollment: "human approval required",
        candidate: "opaque",
        introduction: accepted.data.status,
        disclosure: "selective",
        mcp: "discovery catalog available",
        a2a: "discovery interests available",
        safety: "blocked",
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
