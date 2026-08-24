import assert from "node:assert/strict";
import test from "node:test";
import {
  collapseActivityMessages,
  sessionPeerLabel,
  sessionStatusForHuman,
  sessionTitle,
  sharePrompt,
  visibleActivitySessions,
  voteStatusLabel,
} from "./activity-copy";
import { messageToPlainEnglish, type PublicSession } from "./sessions";
import {
  buildScheduleWaitingResult,
  SCHEDULE_MEETING_TOOL_DESCRIPTION,
} from "./schedule-copy";
import { MCP_TOOLS } from "./mcp-tools";

function session(overrides: Partial<PublicSession> = {}): PublicSession {
  return {
    id: "s1",
    intentType: "schedule_meeting",
    status: "open",
    initiatorUserId: "u1",
    peerUserId: null,
    linkId: null,
    payload: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    peer: null,
    participants: [],
    multiParty: false,
    ...overrides,
  };
}

test("board copy waits for the person and/or their agent", () => {
  const row = session({
    payload: { title: "Brainstorming", phase: "waiting_for_peer" },
    peer: { id: "u2", email: "rishav@example.com", name: "Rishav Sharma" },
  });
  assert.equal(sessionTitle(row), "Brainstorming");
  assert.equal(sessionPeerLabel(row), "Rishav Sharma");
  assert.equal(
    sessionStatusForHuman(row),
    "Waiting for Rishav Sharma and/or their agent",
  );
  assert.equal(
    sessionStatusForHuman(
      session({
        payload: {
          phase: "waiting_for_peer",
          agentNotify: [
            {
              email: "rishav@example.com",
              reach: "delivered_to_sage",
              hasPairedAgent: true,
            },
          ],
        },
        peer: { id: "u2", email: "rishav@example.com", name: "Rishav Sharma" },
      }),
    ),
    "Waiting for Rishav Sharma's Sage",
  );
  assert.equal(
    sessionStatusForHuman(
      session({
        payload: {
          phase: "waiting_for_peer",
          agentNotify: [
            {
              email: "rishav@example.com",
              reach: "delivered_to_agent",
              hasPairedAgent: true,
            },
          ],
        },
        peer: { id: "u2", email: "rishav@example.com", name: "Rishav Sharma" },
      }),
    ),
    "Waiting for Rishav Sharma's agent",
  );
  assert.equal(
    sessionStatusForHuman(
      session({
        payload: {
          phase: "waiting_for_peer",
          agentNotify: [
            {
              email: "rishav@example.com",
              reach: "no_paired_agent",
              hasPairedAgent: false,
            },
          ],
        },
        peer: { id: "u2", email: "rishav@example.com", name: "Rishav Sharma" },
      }),
    ),
    "Waiting for Rishav Sharma to connect an agent",
  );
  assert.equal(sessionStatusForHuman(session({ status: "confirmed" })), "Booked");
  assert.equal(sessionStatusForHuman(session({ status: "cancelled" })), "Stopped");
});

test("activity list stays empty when the only tasks are stopped", () => {
  const stopped = session({ id: "s-stopped", status: "cancelled" });
  const open = session({ id: "s-open", status: "open" });
  assert.deepEqual(visibleActivitySessions([stopped], false), []);
  assert.deepEqual(visibleActivitySessions([stopped], true), [stopped]);
  assert.deepEqual(visibleActivitySessions([stopped, open], false), [open]);
});

test("share prompt tells the human HoneyMatcha does not email", () => {
  const prompt = sharePrompt(
    session({
      payload: {
        phase: "waiting_for_peer",
        title: "Brainstorming",
        waitingFor: [
          {
            email: "rishav@example.com",
            name: "Rishav",
            inviteUrl: "https://honeymatcha.io/invite/HM-TEST",
            guestUrl: "https://honeymatcha.io/guest/abc#gt_token",
          },
        ],
      },
    }),
  );
  assert.ok(prompt);
  assert.match(prompt!.headline, /Rishav/);
  assert.match(prompt!.body, /cannot reach their agent/i);
  assert.equal(prompt!.inviteUrl, "https://honeymatcha.io/invite/HM-TEST");
  assert.ok(prompt!.guestUrl?.includes("/guest/"));
});

test("activity messages hide technical kinds and collapse duplicates", () => {
  assert.equal(
    messageToPlainEnglish("proposal", { title: "Brainstorming" }),
    "Suggested: Brainstorming",
  );
  assert.equal(
    messageToPlainEnglish("avail.offer", {}),
    "Shared available times (busy times only: no event titles).",
  );
  assert.doesNotMatch(messageToPlainEnglish("mystery.kind", {}), /Event:/);
  const collapsed = collapseActivityMessages([
    {
      id: "1",
      sessionId: "s",
      senderUserId: null,
      actorKind: "agent",
      kind: "avail.offer",
      body: {},
      createdAt: "2026-08-12T22:16:00.000Z",
      plainEnglish: "Shared available times (busy times only: no event titles).",
    },
    {
      id: "2",
      sessionId: "s",
      senderUserId: null,
      actorKind: "agent",
      kind: "avail.offer",
      body: {},
      createdAt: "2026-08-12T22:16:01.000Z",
      plainEnglish: "Shared available times (busy times only: no event titles).",
    },
  ]);
  assert.equal(collapsed.length, 1);
  assert.equal(voteStatusLabel("pending"), "hasn't responded");
});

test("schedule waiting result forbids agents from booking Google themselves", () => {
  const result = buildScheduleWaitingResult({
    sessionId: "s1",
    title: "Brainstorming",
    waiting: [
      {
        email: "rishav@example.com",
        name: "Rishav",
        userId: null,
        onHoneyMatcha: false,
        linked: false,
        inviteUrl: "https://honeymatcha.io/invite/HM-TEST",
        guestUrl: "https://honeymatcha.io/guest/abc#gt_token",
        reason: "not_on_honeymatcha",
      },
    ],
  });
  assert.equal(result.scheduled, false);
  assert.equal(result.booked, false);
  assert.match(result.agent_instructions, /Do not book a Google Calendar event/);
  assert.equal(result.share_url, "https://honeymatcha.io/invite/HM-TEST");
  assert.match(SCHEDULE_MEETING_TOOL_DESCRIPTION, /does not book/i);
  const tool = MCP_TOOLS.find((item) => item.name === "request_schedule_meeting");
  assert.equal(tool?.description, SCHEDULE_MEETING_TOOL_DESCRIPTION);
  assert.ok(MCP_TOOLS.some((item) => item.name === "get_inbox"));
});
