import { isAgentAuth, jsonFromAgentError, readJsonBody, requireAgent } from "@/lib/http";
import {
  agentPostEventNote,
  agentRetractEventNote,
} from "@/lib/events/agent-api";

export const dynamic = "force-dynamic";

/**
 * Leave a note on the event. Notes are read back through get_event_board,
 * which already carries them projected for this agent's human — there is no
 * separate read endpoint, so an agent cannot accidentally read around the
 * board's visibility rules.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAgent(request);
  if (!isAgentAuth(auth)) return auth;
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    return Response.json(await agentPostEventNote(auth, { ...body, eventId: id }));
  } catch (err) {
    return jsonFromAgentError(err);
  }
}

/** Retract the human's own note, or — for the organizer — remove anyone's. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAgent(request);
  if (!isAgentAuth(auth)) return auth;
  try {
    const { id } = await params;
    const noteId = new URL(request.url).searchParams.get("noteId") ?? undefined;
    const body = await readJsonBody(request).catch(() => ({}));
    return Response.json(
      await agentRetractEventNote(auth, {
        ...body,
        eventId: id,
        noteId: noteId ?? (body as { noteId?: unknown }).noteId,
      }),
    );
  } catch (err) {
    return jsonFromAgentError(err);
  }
}
