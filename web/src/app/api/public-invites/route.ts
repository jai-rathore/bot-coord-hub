import { ensureCurrentUser } from "@/lib/users";
import {
  createPublicInvite,
  listPublicInvites,
} from "@/lib/public-invites";
import { jsonError, requestOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json({
      publicInvites: await listPublicInvites(user, requestOrigin(request)),
    });
  } catch (error) {
    return jsonError(error, "Failed to list public invites");
  }
}

export async function POST(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: {
    label?: unknown;
    scopes?: unknown;
    confirmRequired?: boolean;
    expiresInHours?: unknown;
    maxRedemptions?: unknown;
  } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const publicInvite = await createPublicInvite({
      owner: user,
      label: body.label,
      scopes: body.scopes,
      confirmRequired: body.confirmRequired,
      expiresInHours: body.expiresInHours,
      maxRedemptions: body.maxRedemptions,
      origin: requestOrigin(request),
    });
    return Response.json(
      {
        publicInvite,
        message:
          "Share this link or QR code. Each person sends you a connection request for approval.",
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error, "Failed to create public invite");
  }
}
