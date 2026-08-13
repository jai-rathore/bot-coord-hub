import { desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { sessionParticipants, sessions } from "@/db/schema";
import { sessionIdsForUser } from "@/lib/schedule-meeting";
import { intentLabel, taskStatusLabel } from "@/lib/intent-labels";
import { voteStatusLabel } from "@/lib/activity-copy";
import { ensureCurrentUser } from "@/lib/users";

export async function MultiPartyActivity() {
  const user = await ensureCurrentUser();
  if (!user) {
    return (
      <p className="mt-6 text-sm text-muted">Sign in to see session activity.</p>
    );
  }

  const db = getDb();
  const participantIds = await sessionIdsForUser(user.id);
  const rows = await db
    .select()
    .from(sessions)
    .where(
      participantIds.length > 0
        ? or(
            eq(sessions.initiatorUserId, user.id),
            eq(sessions.peerUserId, user.id),
            inArray(sessions.id, participantIds),
          )
        : or(
            eq(sessions.initiatorUserId, user.id),
            eq(sessions.peerUserId, user.id),
          ),
    )
    .orderBy(desc(sessions.updatedAt))
    .limit(40);

  const ids = rows.map((r) => r.id);
  const parts =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(sessionParticipants)
          .where(inArray(sessionParticipants.sessionId, ids));

  const groupRows = rows.filter((s) => {
    const participants = parts.filter((p) => p.sessionId === s.id);
    return participants.length >= 3;
  });

  if (groupRows.length === 0) {
    return (
      <p className="mt-6 rounded-md border border-dashed border-line bg-[rgba(255,252,246,0.55)] px-4 py-3 text-sm text-muted">
        No group tasks yet. Two-person meetings appear under Tasks above.
        This section is for coordination with three or more people.
      </p>
    );
  }

  return (
    <ul className="mt-6 space-y-4">
      {groupRows.map((s) => {
        const participants = parts.filter((p) => p.sessionId === s.id);
        const payload = (s.payload ?? {}) as {
          title?: string;
          phase?: string;
          acceptedSlot?: { start: string; end: string; timezone: string };
          calendarEvent?: {
            provider: string;
            eventId: string;
            htmlLink?: string;
          };
          confirmRequired?: boolean;
        };
        return (
          <li key={s.id} className="border-b border-line/80 pb-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-[family-name:var(--font-fraunces)] text-lg text-matcha-deep">
                {payload.title || intentLabel(s.intentType)}
              </h2>
              <span className="text-xs uppercase tracking-wide text-muted">
                {taskStatusLabel(s.status)} · group
              </span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink">
              {participants.map((p) => (
                <li key={p.id}>
                  <span className="text-muted">
                    {p.role === "organizer" ? "Organizer" : "Invitee"}:
                  </span>{" "}
                  {p.email}
                  <span className="text-muted">
                    {" "}
                    ({voteStatusLabel(p.voteStatus)})
                  </span>
                </li>
              ))}
            </ul>
            {payload.acceptedSlot ? (
              <p className="mt-2 text-sm text-ink">
                Proposed time:{" "}
                {new Date(payload.acceptedSlot.start).toLocaleString()} →{" "}
                {new Date(payload.acceptedSlot.end).toLocaleString()}
              </p>
            ) : null}
            {payload.calendarEvent ? (
              <p className="mt-1 text-sm text-matcha">
                Booked via {payload.calendarEvent.provider}
                {payload.calendarEvent.htmlLink ? (
                  <>
                    {" · "}
                    <a
                      href={payload.calendarEvent.htmlLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      open event
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
