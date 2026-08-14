import { ensureCurrentUser } from "@/lib/users";
import { redeemPublicInvite } from "@/lib/public-invites";
import { jsonError } from "@/lib/http";
import {
  publicInviteRateLimitKey,
  rateLimit,
  rateLimitedJson,
  rateLimitHeaders,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { token?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const token = body.token?.trim() ?? "";
  const limit = rateLimit(publicInviteRateLimitKey(request, token), 10);
  if (!limit.ok) return rateLimitedJson(limit);
  try {
    return Response.json(await redeemPublicInvite({ user, token }), {
      headers: rateLimitHeaders(limit),
    });
  } catch (error) {
    const response = jsonError(error, "Failed to redeem public invite");
    for (const [key, value] of Object.entries(rateLimitHeaders(limit))) {
      response.headers.set(key, String(value));
    }
    return response;
  }
}
