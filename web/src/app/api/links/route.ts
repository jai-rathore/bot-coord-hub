import { ensureCurrentUser } from "@/lib/users";
import { createInviteLink, listLinksForUser } from "@/lib/links";
import { requestOrigin } from "@/lib/invite";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const links = await listLinksForUser(user, requestOrigin(request));
    return Response.json({ links });
  } catch (err) {
    return jsonError(err, "Failed to list links");
  }
}

export async function POST(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    toEmail?: string;
    toName?: string;
    scopes?: string[];
  } = {};
  try {
    body = await request.json();
  } catch {
    // open invite with empty body is ok
  }

  try {
    const link = await createInviteLink({
      fromUser: user,
      toEmail: body.toEmail,
      toName: body.toName,
      scopes: body.scopes,
      origin: requestOrigin(request),
    });
    return Response.json(
      {
        link,
        message:
          "Share this link with a friend’s bot/human so they can accept and form a mutual link.",
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, "Failed to create invite");
  }
}
