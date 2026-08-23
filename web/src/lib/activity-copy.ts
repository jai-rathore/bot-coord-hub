import { intentLabel } from "@/lib/intent-labels";
import type { AgentReach } from "@/lib/agent-inbox";
import type { PublicMessage, PublicSession } from "@/lib/sessions";

export type WaitingForPerson = {
  email: string;
  name?: string | null;
  inviteUrl?: string | null;
  guestUrl?: string | null;
  reason?: string | null;
  reach?: AgentReach | null;
  hasPairedAgent?: boolean;
  inboxId?: string | null;
};

export function possessiveName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "their";
  return /s$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}'s`;
}

export function waitingForAgentLine(
  peerLabel: string,
  reach: AgentReach | null | undefined,
): string {
  if (reach === "delivered_to_agent") {
    return `Waiting for ${possessiveName(peerLabel)} agent`;
  }
  if (reach === "no_paired_agent") {
    return `Waiting for ${peerLabel} to connect an agent`;
  }
  return `Waiting for ${peerLabel} and/or their agent`;
}

function reachFromSession(session: PublicSession): AgentReach | null {
  const waiting = waitingForFromPayload(session.payload);
  if (waiting[0]?.reach) return waiting[0].reach;
  const raw = session.payload.agentNotify;
  if (Array.isArray(raw) && raw[0] && typeof raw[0] === "object") {
    const reach = (raw[0] as { reach?: unknown }).reach;
    if (
      reach === "delivered_to_agent" ||
      reach === "no_paired_agent" ||
      reach === "not_on_honeymatcha"
    ) {
      return reach;
    }
  }
  return null;
}

export function sessionTitle(session: PublicSession): string {
  const title = session.payload.title;
  if (typeof title === "string" && title.trim() && title.trim() !== "Meeting") {
    return title.trim();
  }
  return intentLabel(session.intentType);
}

export function waitingForFromPayload(
  payload: Record<string, unknown>,
): WaitingForPerson[] {
  const raw = payload.waitingFor;
  if (!Array.isArray(raw)) return [];
  const people: WaitingForPerson[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.email !== "string" || !row.email.trim()) continue;
    people.push({
      email: row.email.trim().toLowerCase(),
      name: typeof row.name === "string" ? row.name : null,
      inviteUrl: typeof row.inviteUrl === "string" ? row.inviteUrl : null,
      guestUrl: typeof row.guestUrl === "string" ? row.guestUrl : null,
      reason: typeof row.reason === "string" ? row.reason : null,
      reach:
        row.reach === "delivered_to_agent" ||
        row.reach === "no_paired_agent" ||
        row.reach === "not_on_honeymatcha"
          ? row.reach
          : null,
      hasPairedAgent: row.hasPairedAgent === true,
      inboxId: typeof row.inboxId === "string" ? row.inboxId : null,
    });
  }
  return people;
}

export function sessionPeerLabel(session: PublicSession): string {
  if (session.peer?.name?.trim()) return session.peer.name.trim();
  if (session.peer?.email) return session.peer.email;
  const waiting = waitingForFromPayload(session.payload);
  if (waiting[0]?.name?.trim()) return waiting[0].name!.trim();
  if (waiting[0]?.email) return waiting[0].email;
  const invitee = session.participants.find((p) => p.role === "invitee");
  if (invitee?.email) return invitee.email;
  return "Not sent to anyone";
}

export function sessionStatusForHuman(session: PublicSession): string {
  const phase =
    typeof session.payload.phase === "string" ? session.payload.phase : "";
  if (session.status === "confirmed" || phase === "confirmed") return "Booked";
  if (session.status === "cancelled") return "Stopped";
  if (session.status === "accepted" || phase === "awaiting_confirm") {
    return "Needs your OK";
  }
  if (session.status === "proposed" || phase === "proposing") {
    return "Times suggested";
  }
  if (phase === "waiting_for_calendars") {
    return `Waiting for ${sessionPeerLabel(session)} to connect a calendar`;
  }
  const pendingInvitee = session.participants.some(
    (p) => p.role === "invitee" && p.voteStatus === "pending",
  );
  if (phase === "waiting_for_peer" || pendingInvitee) {
    return waitingForAgentLine(
      sessionPeerLabel(session),
      reachFromSession(session),
    );
  }
  if (!session.peer && waitingForFromPayload(session.payload).length === 0) {
    return "Not sent to anyone";
  }
  return "In progress";
}

export function visibleActivitySessions<T extends { status: string }>(
  sessions: T[],
  showStopped: boolean,
): T[] {
  if (showStopped) return sessions;
  return sessions.filter((session) => session.status !== "cancelled");
}

export function collapseActivityMessages(
  messages: PublicMessage[],
): PublicMessage[] {
  const out: PublicMessage[] = [];
  for (const message of messages) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.plainEnglish === message.plainEnglish &&
      prev.kind === message.kind
    ) {
      continue;
    }
    out.push(message);
  }
  return out;
}

export function voteStatusLabel(status: string): string {
  return (
    {
      pending: "hasn't responded",
      accepted: "in",
      declined: "declined",
    }[status] ?? status
  );
}

export function sharePrompt(session: PublicSession): {
  headline: string;
  body: string;
  inviteUrl: string | null;
  guestUrl: string | null;
} | null {
  const waiting = waitingForFromPayload(session.payload);
  const peerName = sessionPeerLabel(session);
  const inviteUrl = waiting[0]?.inviteUrl ?? null;
  const guestUrl = waiting[0]?.guestUrl ?? null;
  const phase =
    typeof session.payload.phase === "string" ? session.payload.phase : "";
  const pendingInvitee = session.participants.some(
    (p) => p.role === "invitee" && p.voteStatus === "pending",
  );
  const notSent =
    !session.peer && waiting.length === 0 && session.participants.length <= 1;

  if (phase === "waiting_for_calendars") {
    return {
      headline: `Waiting for ${peerName} to connect a calendar`,
      body: "HoneyMatcha will not pick a time from your calendar alone. Ask them to connect Google Calendar on HoneyMatcha.",
      inviteUrl,
      guestUrl,
    };
  }

  if (phase === "waiting_for_peer" || pendingInvitee || inviteUrl || notSent) {
    const reach = reachFromSession(session);
    const hasLink = Boolean(inviteUrl || guestUrl);
    if (notSent && !inviteUrl) {
      return {
        headline: "This was not sent to anyone",
        body: "HoneyMatcha did not reach another person or their agent.",
        inviteUrl,
        guestUrl,
      };
    }
    if (reach === "delivered_to_agent") {
      return {
        headline: `Waiting for ${possessiveName(peerName)} agent`,
        body: "HoneyMatcha put this on their agent inbox. If their agent is connected, it will see this the next time it calls HoneyMatcha. HoneyMatcha does not ping the human: their agent does that.",
        inviteUrl,
        guestUrl,
      };
    }
    if (reach === "no_paired_agent") {
      return {
        headline: `Waiting for ${peerName} to connect an agent`,
        body: "They have a HoneyMatcha account, but no paired agent yet. The request is sitting in their agent inbox for when they connect one. If they have not signed in, send the link below.",
        inviteUrl,
        guestUrl,
      };
    }
    return {
      headline: `Waiting for ${peerName} and/or their agent`,
      body: hasLink
        ? "HoneyMatcha cannot reach their agent until they join. Copy the link and send it. Do not treat a Google invite from your agent as confirmation."
        : "HoneyMatcha cannot reach their agent until they join and connect one. Invite them from People.",
      inviteUrl,
      guestUrl,
    };
  }

  return null;
}
