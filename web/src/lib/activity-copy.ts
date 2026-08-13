import { intentLabel } from "@/lib/intent-labels";
import type { PublicMessage, PublicSession } from "@/lib/sessions";

export type WaitingForPerson = {
  email: string;
  name?: string | null;
  inviteUrl?: string | null;
  guestUrl?: string | null;
  reason?: string | null;
};

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
  if (phase === "waiting_for_peer" || phase === "waiting_for_calendars") {
    return `Waiting for ${sessionPeerLabel(session)}`;
  }
  const pendingInvitee = session.participants.some(
    (p) => p.role === "invitee" && p.voteStatus === "pending",
  );
  if (pendingInvitee) return `Waiting for ${sessionPeerLabel(session)}`;
  if (!session.peer && waitingForFromPayload(session.payload).length === 0) {
    return "Not sent to anyone";
  }
  return "In progress";
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
    const hasLink = Boolean(inviteUrl || guestUrl);
    return {
      headline:
        notSent && !inviteUrl
          ? "This was not sent to anyone"
          : `${peerName} has not joined this yet`,
      body: hasLink
        ? "HoneyMatcha does not email people. Copy the link and send it yourself. Do not treat a Google invite from your agent as confirmation."
        : "HoneyMatcha does not email people. Ask them to open HoneyMatcha, or invite them from People and send that URL. A Google invite from your agent is not confirmation.",
      inviteUrl,
      guestUrl,
    };
  }

  return null;
}
