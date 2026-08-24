import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  eventDimensions,
  eventMessages,
  events,
  guestTasks,
  links,
  sageJobs,
  sageRuns,
  users,
  type SageJob,
  type User,
} from "../src/db/schema";
import {
  getSageCapability,
  type SageCapabilityName,
} from "../src/lib/sage/capabilities";
import {
  enqueueSageJob,
  ownerResultForSageJob,
} from "../src/lib/sage/job-store";
import { deliverEventInbox } from "../src/lib/agent-inbox";

const db = getDb();

function pause(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitForJob(jobId: string): Promise<SageJob> {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const [job] = await db
      .select()
      .from(sageJobs)
      .where(eq(sageJobs.id, jobId))
      .limit(1);
    if (!job) throw new Error(`Sage job ${jobId} disappeared`);
    if (["completed", "waiting_human"].includes(job.state)) return job;
    if (["failed", "dead_letter"].includes(job.state)) {
      throw new Error(
        `Sage job ${job.capability} ended ${job.state}: ${job.lastError ?? "unknown error"}`,
      );
    }
    await pause(500);
  }
  throw new Error(`Sage job ${jobId} did not finish within 90 seconds`);
}

async function runCapability(input: {
  user: User;
  capability: SageCapabilityName;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}) {
  const capability = getSageCapability(input.capability);
  const payload = capability.parseInput(input.payload);
  const queued = await enqueueSageJob({
    user: input.user,
    capability: input.capability,
    trigger: "user_request",
    payload,
    redactedPayload: capability.redactInput(payload),
    idempotencyKey: input.idempotencyKey,
    maxAttempts: 2,
  });
  assert.match(queued.job.payloadEncrypted ?? "", /^enc:v1:/);
  const finished = await waitForJob(queued.job.id);
  assert.match(finished.resultEncrypted ?? "", /^enc:v1:/);
  const result = ownerResultForSageJob(finished);
  assert.ok(result, `${input.capability} must return an owner-visible result`);
  return { queued, finished, result };
}

async function main() {
  const suffix = randomBytes(5).toString("hex");
  const createdUserIds: string[] = [];

  try {
    const [owner] = await db
      .insert(users)
      .values({
        clerkUserId: `sage_parity_owner_${suffix}`,
        email: `sage_parity_owner_${suffix}@example.com`,
        name: "Sage Parity Owner",
      })
      .returning();
    const [peer] = await db
      .insert(users)
      .values({
        clerkUserId: `sage_parity_peer_${suffix}`,
        email: `sage_parity_peer_${suffix}@example.com`,
        name: "Sage Parity Peer",
      })
      .returning();
    createdUserIds.push(owner.id, peer.id);

    const now = Date.now();
    const privateTitle = `Private Sage event ${suffix}`;
    const eventKey = `sage-parity-event-${suffix}`;
    const createdEvent = await runCapability({
      user: owner,
      capability: "coordinate_event",
      idempotencyKey: eventKey,
      payload: {
        action: "create",
        title: privateTitle,
        timezone: "UTC",
        deadlineAt: new Date(now + 48 * 60 * 60_000).toISOString(),
        fixedStartsAt: new Date(now + 72 * 60 * 60_000).toISOString(),
      },
    });
    assert.equal(
      JSON.stringify(createdEvent.finished.payload).includes(privateTitle),
      false,
      "operational event payload must not contain the private title",
    );
    const eventId = String(createdEvent.result.eventId);
    assert.match(eventId, /^[0-9a-f-]{36}$/i);
    const replayedEvent = await enqueueSageJob({
      user: owner,
      capability: "coordinate_event",
      trigger: "user_request",
      payload: getSageCapability("coordinate_event").parseInput({
        action: "create",
        title: privateTitle,
        timezone: "UTC",
        deadlineAt: new Date(now + 48 * 60 * 60_000).toISOString(),
        fixedStartsAt: new Date(now + 72 * 60 * 60_000).toISOString(),
      }),
      redactedPayload: { action: "create", hasTitle: true },
      idempotencyKey: eventKey,
    });
    assert.equal(replayedEvent.created, false);
    assert.equal(replayedEvent.job.id, createdEvent.finished.id);
    const storedEvents = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId));
    assert.equal(storedEvents.length, 1);
    assert.equal(
      (
        await db
          .select()
          .from(eventDimensions)
          .where(eq(eventDimensions.eventId, eventId))
      ).length,
      2,
      "event creation must be atomic and replay-safe",
    );
    console.log("PASS coordinate_event through the live worker");

    const triggered = await deliverEventInbox({
      userId: owner.id,
      eventId,
      kind: "event.deadline_soon",
      summary: "Synthetic deadline review",
      body: { eventId, template: "deadline_soon" },
      dedupeKey: `sage-parity-deadline-${suffix}`,
    });
    assert.ok(triggered.inboxId, "deadline delivery must create an inbox item");
    const [triggeredJob] = await db
      .select()
      .from(sageJobs)
      .where(
        and(
          eq(sageJobs.userId, owner.id),
          eq(sageJobs.idempotencyKey, `deadline:${triggered.inboxId}`),
        ),
      )
      .limit(1);
    assert.ok(triggeredJob, "the selected Sage operator must receive the trigger");
    const finishedTrigger = await waitForJob(triggeredJob.id);
    assert.equal(finishedTrigger.trigger, "deadline");
    assert.equal(ownerResultForSageJob(finishedTrigger)?.action, "event");
    console.log("PASS event deadline routed once to the selected Sage operator");

    const privateChat = `Confirm event help ${suffix}`;
    const chat = await runCapability({
      user: owner,
      capability: "event_chat",
      idempotencyKey: `sage-parity-chat-${suffix}`,
      payload: {
        eventId,
        message: `${privateChat}. Reply briefly and do not change the event.`,
      },
    });
    assert.equal(
      JSON.stringify(chat.finished.payload).includes(privateChat),
      false,
      "operational chat payload must not contain the private message",
    );
    assert.equal(typeof chat.result.reply, "string");
    const transcript = await db
      .select()
      .from(eventMessages)
      .where(eq(eventMessages.eventId, eventId));
    assert.equal(transcript.filter((row) => row.role === "agent").length, 1);
    assert.equal(transcript.filter((row) => row.role === "organizer").length, 1);
    const [chatRun] = await db
      .select()
      .from(sageRuns)
      .where(eq(sageRuns.jobId, chat.finished.id));
    assert.equal(chatRun.provider, "gemini");
    assert.ok((chatRun.inputTokens ?? 0) > 0);
    console.log("PASS event_chat through Gemini and the live worker");

    const privateRole = `Platform engineer ${suffix}`;
    const guest = await runCapability({
      user: owner,
      capability: "run_guest_request",
      idempotencyKey: `sage-parity-guest-${suffix}`,
      payload: {
        action: "create",
        taskType: "hiring_compatibility",
        title: privateRole,
        targetEmail: peer.email,
        privateConfig: {
          compensationMaximum: 250_000,
          workModes: ["remote"],
        },
        expiresInMinutes: 60,
        maxResponses: 1,
        origin: "https://honeymatcha.io",
      },
    });
    assert.equal(
      JSON.stringify(guest.finished.payload).includes(peer.email),
      false,
      "operational guest payload must not contain the candidate email",
    );
    assert.equal(typeof guest.result.guestUrl, "string");
    const [guestTask] = await db
      .select()
      .from(guestTasks)
      .where(eq(guestTasks.publicId, String(guest.result.publicId)));
    assert.match(guestTask.tokenEncrypted ?? "", /^enc:v1:/);
    assert.equal(
      JSON.stringify(guestTask).includes(
        String(guest.result.guestUrl).split("#").at(-1) ?? "",
      ),
      false,
      "the raw guest token must not be stored in plaintext",
    );
    console.log("PASS run_guest_request through the live worker");

    const invite = await runCapability({
      user: owner,
      capability: "manage_connections",
      idempotencyKey: `sage-parity-invite-${suffix}`,
      payload: {
        action: "create_invite",
        toEmail: peer.email,
        toName: peer.name,
        origin: "https://honeymatcha.io",
      },
    });
    assert.equal(
      JSON.stringify(invite.finished.payload).includes(peer.email),
      false,
      "operational invite payload must not contain the recipient email",
    );
    assert.equal(typeof invite.result.link, "object");
    const pendingLinks = await db
      .select()
      .from(links)
      .where(
        and(
          eq(links.fromUserId, owner.id),
          eq(links.toEmail, peer.email),
          eq(links.status, "pending"),
        ),
      );
    assert.equal(pendingLinks.length, 1);
    console.log("PASS manage_connections through the live worker");

    const activity = await runCapability({
      user: owner,
      capability: "review_activity",
      idempotencyKey: `sage-parity-activity-${suffix}`,
      payload: { action: "overview", pendingOnly: true, limit: 10 },
    });
    assert.equal(activity.result.ok, true);
    assert.equal(typeof activity.result.inboxCount, "number");
    assert.equal(typeof activity.result.sessionCount, "number");
    console.log("PASS review_activity through the live worker");

    console.log("HoneyMatcha Sage parity worker e2e passed");
  } finally {
    for (const userId of createdUserIds) {
      await db.delete(users).where(eq(users.id, userId));
    }
    if (createdUserIds.length) console.log("PASS synthetic rows cleaned up");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("HoneyMatcha Sage parity worker e2e FAILED", error);
    process.exit(1);
  });
