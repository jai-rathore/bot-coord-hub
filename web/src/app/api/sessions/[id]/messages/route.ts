import { ensureCurrentUser } from "@/lib/users";
import {
  getSessionForUser,
  listMessagesForSession,
  postSessionMessage,
} from "@/lib/sessions";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    await getSessionForUser(id, user.id);
    const messages = await listMessagesForSession(id);
    return Response.json({ messages });
  } catch (err) {
    return jsonError(err, "Failed to list messages");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  let body: { kind?: string; body?: Record<string, unknown>; text?: string } =
    {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const session = await getSessionForUser(id, user.id);
    const messageBody = {
      ...(body.body ?? {}),
      ...(body.text ? { text: body.text } : {}),
    };
    const message = await postSessionMessage({
      session,
      sender: user,
      kind: body.kind ?? "note",
      body: messageBody,
    });
    return Response.json({ message }, { status: 201 });
  } catch (err) {
    return jsonError(err, "Failed to post message");
  }
}
