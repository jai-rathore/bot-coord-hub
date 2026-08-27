import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "crypto";
import { getDb } from "../src/db";
import { apiKeys, users, type User } from "../src/db/schema";
import type { AgentAuth } from "../src/lib/agent-auth";
import { AgentApiError } from "../src/lib/agent-errors";
import { MCP_TOOLS, dispatchMcpTool } from "../src/lib/mcp-tools";
import { DEFAULT_AGENT_SCOPES } from "../src/lib/scopes";

const ORIGIN = "https://honeymatcha.test";

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}

function asRequest(): Request {
  return new Request(`${ORIGIN}/api/mcp`, { method: "POST" });
}

async function expectStatus(
  label: string,
  fn: () => Promise<unknown>,
  status: number,
  match?: RegExp,
) {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof AgentApiError, `${label}: expected AgentApiError`);
    assert.equal(error.status, status, `${label}: status ${error.status}`);
    if (match) assert.match(error.message, match, label);
    ok(label);
    return;
  }
  throw new Error(`expected rejection: ${label}`);
}

async function main() {
  const db = getDb();
  const suffix = randomBytes(4).toString("hex");

  async function makeUser(tag: string, name: string): Promise<AgentAuth> {
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: `clerk_${tag}_${suffix}`,
        email: `${tag}_${suffix}@example.com`,
        name,
      })
      .returning();
    const [apiKey] = await db
      .insert(apiKeys)
      .values({
        userId: user.id,
        name: `${name} agent`,
        keyPrefix: `hm_${tag}${suffix}`,
        keyHash: randomBytes(16).toString("hex"),
        scopes: DEFAULT_AGENT_SCOPES,
      })
      .returning();
    return { user: user as User, apiKey };
  }

  const recruiter = await makeUser("recruiter", "Recruiter");
  const candidate = await makeUser("candidate", "Candidate");
  const call = (
    auth: AgentAuth,
    tool: string,
    args: Record<string, unknown> = {},
  ) => dispatchMcpTool(auth, tool, args, asRequest());

  console.log("\n1. MCP catalog publishes the recruiting contract");
  const byName = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));
  for (const name of [
    "draft_hiring_role",
    "propose_hiring_role",
    "create_guest_task",
    "notify_hiring_candidate",
    "revise_hiring_request",
    "read_inbound_hiring_request",
    "respond_to_hiring_request",
    "read_guest_task",
  ]) {
    assert.ok(byName.has(name), `${name} missing from MCP catalog`);
  }
  const privateConfig = byName.get("propose_hiring_role")?.inputSchema
    .properties.privateConfig as {
    properties?: { workModes?: { items?: { enum?: string[] } } };
  };
  assert.deepEqual(privateConfig.properties?.workModes?.items?.enum, [
    "Remote",
    "Hybrid",
    "Onsite",
  ]);
  assert.deepEqual(byName.get("draft_hiring_role")?.annotations, {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
  });
  ok("hiring tools and enums are on the wire catalog");

  console.log("\n2. draft_hiring_role stays review-only and fails closed");
  await expectStatus(
    "empty draft is rejected",
    () => call(recruiter, "draft_hiring_role", {}),
    400,
    /job URL or job description/i,
  );
  await expectStatus(
    "unavailable Sage asks the agent to extract terms itself",
    () =>
      call(recruiter, "draft_hiring_role", {
        description:
          "Staff Product Engineer at Matcha Labs. Hybrid in Brooklyn. USD 220000. No equity.",
      }),
    503,
    /extract the recruiter-approved terms yourself/i,
  );

  console.log("\n3. Invalid hiring enums never persist");
  await expectStatus(
    "free-text work mode is rejected",
    () =>
      call(recruiter, "create_guest_task", {
        taskType: "hiring_compatibility",
        title: `Invalid role ${suffix}`,
        targetEmail: candidate.user.email,
        privateConfig: { workModes: ["Anywhere"] },
      }),
    400,
    /workModes is invalid/,
  );

  console.log("\n4. Recruiter agent creates and reads a targeted alignment");
  const created = (await call(recruiter, "create_guest_task", {
    taskType: "hiring_compatibility",
    title: `Staff Product Engineer ${suffix}`,
    description: "Private recruiting alignment.",
    targetEmail: candidate.user.email,
    privateConfig: {
      companyName: "Matcha Labs",
      roleTitle: "Staff Product Engineer",
      compensationMaximum: 220_000,
      compensationCurrency: "USD",
      equityMaximumPercent: 0,
      workModes: ["Hybrid"],
      employmentTypes: ["Full-time"],
      levels: ["Staff / Principal"],
      roleFocus: ["Engineering"],
      sponsorshipAvailable: false,
      locationRadiusMiles: 25,
    },
  })) as {
    task: { publicId: string };
    guestUrl: string;
    offer?: Record<string, unknown>;
  };
  assert.ok(created.task.publicId);
  assert.match(created.guestUrl, /\/guest\//);
  ok("create_guest_task accepts the structured hiring mandate");

  const listed = (await call(recruiter, "list_guest_tasks")) as {
    tasks: Array<{ publicId: string; taskType: string }>;
  };
  assert.ok(
    listed.tasks.some((task) => task.publicId === created.task.publicId),
  );
  ok("list_guest_tasks includes the hiring request");

  const read = (await call(recruiter, "read_guest_task", {
    publicId: created.task.publicId,
  })) as {
    task: { publicId: string };
    offer?: Record<string, unknown>;
    responses: unknown[];
  };
  assert.equal(read.offer?.companyName, "Matcha Labs");
  assert.equal(read.offer?.compensationMaximum, 220_000);
  assert.equal(read.offer?.compensationCurrency, "USD");
  assert.deepEqual(read.offer?.workModes, ["Hybrid"]);
  assert.equal(
    JSON.stringify(read).includes("_targetUserId"),
    false,
    "internal target id must stay off the agent read",
  );
  ok("read_guest_task returns the recruiter offer without internals");

  console.log("\n5. Candidate agent answers through MCP");
  const inbound = (await call(candidate, "read_inbound_hiring_request", {
    publicId: created.task.publicId,
  })) as {
    request: {
      publicId: string;
      offer: Record<string, unknown>;
    };
  };
  assert.equal(inbound.request.publicId, created.task.publicId);
  assert.equal(inbound.request.offer.roleTitle, "Staff Product Engineer");
  ok("read_inbound_hiring_request shows candidate-facing terms");

  await expectStatus(
    "candidate cannot invent a work mode",
    () =>
      call(candidate, "respond_to_hiring_request", {
        publicId: created.task.publicId,
        idempotencyKey: randomUUID(),
        response: { workModes: ["Anywhere"] },
      }),
    400,
    /workModes is invalid/,
  );

  const response = (await call(candidate, "respond_to_hiring_request", {
    publicId: created.task.publicId,
    idempotencyKey: randomUUID(),
    response: {
      companyInterest: "interested",
      roleInterest: "interested",
      compensationMinimum: 200_000,
      compensationCurrency: "USD",
      equityMinimumPercent: 0,
      workModes: ["Hybrid"],
      employmentTypes: ["Full-time"],
      levels: ["Staff / Principal"],
      roleFocus: ["Engineering"],
      sponsorshipRequired: false,
      sharingMode: "gaps_only",
      recruiterMayRevise: true,
      conversationSignal: "ready_if_aligned",
    },
  })) as {
    alignment?: { verdict?: string; alignment?: string };
  };
  assert.ok(
    response.alignment?.verdict,
    `missing verdict: ${JSON.stringify(response)}`,
  );
  assert.notEqual(response.alignment?.verdict, "incompatible");
  ok(`candidate response produced ${response.alignment?.verdict}`);

  const afterResponse = (await call(recruiter, "read_guest_task", {
    publicId: created.task.publicId,
  })) as {
    offer?: Record<string, unknown>;
    responses: Array<{ response?: { verdict?: string; compensationMinimum?: number } }>;
  };
  assert.ok(afterResponse.responses.length >= 1);
  assert.equal(
    afterResponse.responses[0]?.response?.compensationMinimum,
    undefined,
    "organizer must not see raw candidate compensation",
  );
  ok("recruiter sees alignment without raw candidate values");

  console.log("\n6. Recruiter can notify and revise through MCP");
  const notified = (await call(recruiter, "notify_hiring_candidate", {
    publicId: created.task.publicId,
  })) as { delivered?: boolean; reach?: string };
  assert.equal(notified.delivered, true);
  ok("notify_hiring_candidate reaches the paired candidate");

  const revised = (await call(recruiter, "revise_hiring_request", {
    publicId: created.task.publicId,
    privateConfig: {
      compensationMaximum: 240_000,
      compensationCurrency: "USD",
    },
    candidateFacingUpdate: "Approved a higher annual base.",
  })) as { offer?: Record<string, unknown>; alignment?: { verdict?: string } };
  assert.equal(revised.offer?.compensationMaximum, 240_000);
  ok("revise_hiring_request re-runs alignment on approved terms");

  await expectStatus(
    "propose_hiring_role needs a real candidate handle",
    () =>
      call(recruiter, "propose_hiring_role", {
        targetHandle: `missing-${suffix}`,
        title: "Staff Product Engineer",
        privateConfig: { compensationMaximum: 220_000, compensationCurrency: "USD" },
        idempotencyKey: randomUUID(),
      }),
    404,
    /not found/i,
  );

  console.log("\nHiring MCP flow passed.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
